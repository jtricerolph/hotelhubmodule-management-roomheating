<?php
/**
 * AJAX Handlers Class
 *
 * @package HotelHub_Management_RoomHeating
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

/**
 * AJAX handlers class
 */
class HHRH_Ajax {

    /**
     * Singleton instance
     */
    private static $instance = null;

    /**
     * Get singleton instance
     */
    public static function instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Constructor
     */
    private function __construct() {
        $this->init_hooks();
    }

    /**
     * Initialize hooks
     */
    private function init_hooks() {
        // Frontend AJAX actions
        add_action('wp_ajax_hhrh_get_rooms', array($this, 'get_rooms'));
        add_action('wp_ajax_hhrh_get_room_details', array($this, 'get_room_details'));
        add_action('wp_ajax_hhrh_set_temperature', array($this, 'set_temperature'));
        add_action('wp_ajax_hhrh_verify_temperature', array($this, 'verify_temperature'));

        // Admin AJAX actions
        add_action('wp_ajax_hhrh_test_ha_connection', array($this, 'test_ha_connection'));
        add_action('wp_ajax_hhrh_save_settings', array($this, 'save_settings'));
    }

    /**
     * Get all rooms with heating data
     */
    public function get_rooms() {
        check_ajax_referer('hhrh_nonce', 'nonce');

        // Check permission
        if (!wfa_user_can('heating_view')) {
            wp_send_json_error(array(
                'message' => __('You do not have permission to view room heating data.', 'hhrh')
            ));
        }

        $location_id = isset($_POST['location_id']) ? (int)$_POST['location_id'] : hha_get_current_location();

        // Get settings for battery thresholds
        $settings = HHRH_Settings::get($location_id);

        // Get cached sites from hotel hub app
        $integration = hha()->integrations->get_settings($location_id, 'newbook');
        $categories = isset($integration['categories_sort']) ? $integration['categories_sort'] : array();

        // Get Home Assistant API client
        $ha_api = new HHRH_HA_API($location_id);

        // Get all HA states
        $all_states = $ha_api->get_states();

        if (is_wp_error($all_states)) {
            wp_send_json_error(array(
                'message' => $all_states->get_error_message()
            ));
        }

        // Process each room
        $rooms = array();

        foreach ($categories as $category) {
            if (!empty($category['excluded'])) {
                continue;
            }

            foreach ($category['sites'] as $site) {
                if (!empty($site['excluded'])) {
                    continue;
                }

                $room_data = $this->process_room($site, $category, $all_states, $ha_api, $settings);

                if ($room_data) {
                    $rooms[] = $room_data;
                }
            }
        }

        wp_send_json_success(array(
            'rooms' => $rooms,
            'timestamp' => current_time('timestamp')
        ));
    }

    /**
     * Process individual room data
     *
     * @param array $site Site data from NewBook
     * @param array $category Category data
     * @param array $all_states All HA states
     * @param HHRH_HA_API $ha_api HA API client
     * @param array $settings Settings with battery thresholds
     * @return array|null Room data or null on error
     */
    private function process_room($site, $category, $all_states, $ha_api, $settings) {
        $normalized_name = $ha_api->normalize_site_name($site['site_name']);
        $room_number = $ha_api->extract_room_number($site['site_name']);

        // Get HA entities for this room
        $should_heat_entity = $ha_api->find_state($all_states, "binary_sensor.{$normalized_name}_should_heat");
        $room_state_entity = $ha_api->find_state($all_states, "sensor.{$normalized_name}_room_state");

        // Get timing information
        $arrival = $ha_api->find_state($all_states, "sensor.{$normalized_name}_arrival");
        $departure = $ha_api->find_state($all_states, "sensor.{$normalized_name}_departure");
        $heating_start = $ha_api->find_state($all_states, "sensor.{$normalized_name}_heating_start_time");

        // Find TRVs using room number from site_name
        $trvs = $ha_api->find_trvs($all_states, $room_number);

        // Determine heating status
        $heating_status = 'idle';
        if (!empty($trvs)) {
            if ($should_heat_entity && $should_heat_entity['state'] === 'on') {
                $heating_status = 'heating';
            }
        } else {
            $heating_status = 'error'; // No TRVs found
        }

        // Calculate average temperature
        $avg_temp = $ha_api->calculate_avg_temp($trvs);

        // Process TRV data and check battery levels
        $trv_data = array();
        $battery_status = 'ok'; // ok, warning, critical
        $min_battery = 100;

        foreach ($trvs as $trv) {
            // Extract location from entity ID (e.g., climate.room_101_bedroom -> Bedroom)
            if (preg_match('/climate\.room_\d+_(.+)$/', $trv['entity_id'], $matches)) {
                $location = ucfirst(str_replace('_', ' ', $matches[1]));
            } else {
                $location = 'Unknown';
            }

            // Get battery level and valve position
            $trv_base = str_replace('climate.', '', $trv['entity_id']);
            $battery_entity = $ha_api->find_state($all_states, "sensor.{$trv_base}_trv_battery");
            $battery_level = $battery_entity ? (int)$battery_entity['state'] : null;

            $valve_entity = $ha_api->find_state($all_states, "sensor.{$trv_base}_trv_valve_position");
            $valve_position = $valve_entity ? (int)$valve_entity['state'] : null;

            if ($battery_level !== null && $battery_level < $min_battery) {
                $min_battery = $battery_level;
            }

            $trv_data[] = array(
                'entity_id'      => $trv['entity_id'],
                'location'       => $location,
                'current_temp'   => isset($trv['attributes']['current_temperature']) ? (float)$trv['attributes']['current_temperature'] : null,
                'target_temp'    => isset($trv['attributes']['temperature']) ? (float)$trv['attributes']['temperature'] : null,
                'hvac_mode'      => isset($trv['state']) ? $trv['state'] : 'unknown',
                'battery'        => $battery_level,
                'valve_position' => $valve_position
            );
        }

        // Determine battery status based on thresholds
        if ($min_battery < 100) {
            $critical_threshold = isset($settings['battery_critical_percent']) ? (int)$settings['battery_critical_percent'] : 15;
            $warning_threshold = isset($settings['battery_warning_percent']) ? (int)$settings['battery_warning_percent'] : 30;

            if ($min_battery <= $critical_threshold) {
                $battery_status = 'critical';
            } elseif ($min_battery <= $warning_threshold) {
                $battery_status = 'warning';
            }
        }

        return array(
            'room_id'         => $site['site_id'],
            'room_name'       => $site['site_name'],
            'category'        => $category['name'],
            'category_id'     => $category['id'],
            'category_order'  => isset($category['order']) ? (int)$category['order'] : 0,
            'site_order'      => isset($site['order']) ? (int)$site['order'] : 0,
            'heating_status'  => $heating_status,
            'room_state'      => $room_state_entity ? $room_state_entity['state'] : null,
            'arrival'         => $arrival ? $arrival['state'] : null,
            'departure'       => $departure ? $departure['state'] : null,
            'heating_start'   => $heating_start ? $heating_start['state'] : null,
            'avg_temperature' => $avg_temp,
            'battery_status'  => $battery_status,
            'min_battery'     => $min_battery < 100 ? $min_battery : null,
            'trvs'            => $trv_data
        );
    }

    /**
     * Get detailed room information for modal
     */
    public function get_room_details() {
        check_ajax_referer('hhrh_nonce', 'nonce');

        // Check permission
        if (!wfa_user_can('heating_view')) {
            wp_send_json_error(array(
                'message' => __('You do not have permission to view room details.', 'hhrh')
            ));
        }

        $room_id = isset($_POST['room_id']) ? sanitize_text_field($_POST['room_id']) : '';
        $location_id = isset($_POST['location_id']) ? (int)$_POST['location_id'] : hha_get_current_location();

        if (empty($room_id)) {
            wp_send_json_error(array(
                'message' => __('Room ID is required.', 'hhrh')
            ));
        }

        // Get settings
        $settings = HHRH_Settings::get($location_id);

        // Get site info from cache
        $integration = hha()->integrations->get_settings($location_id, 'newbook');
        $categories = isset($integration['categories_sort']) ? $integration['categories_sort'] : array();

        $site = null;
        $site_name = '';

        foreach ($categories as $category) {
            foreach ($category['sites'] as $s) {
                if ($s['site_id'] === $room_id) {
                    $site = $s;
                    $site_name = $s['site_name'];
                    break 2;
                }
            }
        }

        if (!$site) {
            wp_send_json_error(array(
                'message' => __('Room not found.', 'hhrh')
            ));
        }

        // Get HA data
        $ha_api = new HHRH_HA_API($location_id);
        $normalized_name = $ha_api->normalize_site_name($site_name);
        $room_number = $ha_api->extract_room_number($site_name);

        $all_states = $ha_api->get_states(false); // Don't use cache for modal

        if (is_wp_error($all_states)) {
            wp_send_json_error(array(
                'message' => $all_states->get_error_message()
            ));
        }

        // Get room entities
        $should_heat = $ha_api->find_state($all_states, "binary_sensor.{$normalized_name}_should_heat");
        $room_state = $ha_api->find_state($all_states, "sensor.{$normalized_name}_room_state");
        $guest_name = $ha_api->find_state($all_states, "sensor.{$normalized_name}_guest_name");
        $arrival = $ha_api->find_state($all_states, "sensor.{$normalized_name}_arrival");
        $departure = $ha_api->find_state($all_states, "sensor.{$normalized_name}_departure");
        $heating_start = $ha_api->find_state($all_states, "sensor.{$normalized_name}_heating_start_time");
        $cooling_start = $ha_api->find_state($all_states, "sensor.{$normalized_name}_cooling_start_time");

        // Get TRVs with full details using room number from site_name
        $trvs = $ha_api->find_trvs($all_states, $room_number);
        $trv_details = array();

        foreach ($trvs as $trv) {
            // Extract location (removed _trv requirement)
            if (preg_match('/climate\.room_\d+_(.+)$/', $trv['entity_id'], $matches)) {
                $location = ucfirst(str_replace('_', ' ', $matches[1]));
            } else {
                $location = 'Unknown';
            }

            // Get associated sensors (battery, wifi, valve, command target temp, etc.)
            $trv_base = str_replace('climate.', '', $trv['entity_id']);
            $battery = $ha_api->find_state($all_states, "sensor.{$trv_base}_trv_battery");
            $wifi = $ha_api->find_state($all_states, "sensor.{$trv_base}_trv_wifi_signal");
            $valve = $ha_api->find_state($all_states, "sensor.{$trv_base}_trv_valve_position");
            $command_target = $ha_api->find_state($all_states, "sensor.{$trv_base}_trv_target_temperature");

            // Get the climate's actual target temp and the command target temp
            $climate_target = isset($trv['attributes']['temperature']) ? (float)$trv['attributes']['temperature'] : null;
            $command_target_temp = $command_target ? (float)$command_target['state'] : null;

            // Determine if there's a pending target change (command != climate target)
            $has_pending_target = ($command_target_temp !== null && $climate_target !== null && abs($command_target_temp - $climate_target) > 0.1);

            $trv_details[] = array(
                'entity_id'           => $trv['entity_id'],
                'location'            => $location,
                'current_temp'        => isset($trv['attributes']['current_temperature']) ? (float)$trv['attributes']['current_temperature'] : null,
                'target_temp'         => $climate_target,
                'command_target_temp' => $command_target_temp,
                'has_pending_target'  => $has_pending_target,
                'hvac_mode'           => isset($trv['state']) ? $trv['state'] : 'unknown',
                'battery'             => $battery ? $battery['state'] : null,
                'wifi_signal'         => $wifi ? $wifi['state'] : null,
                'valve_position'      => $valve ? (int)$valve['state'] : null,
                'last_updated'        => isset($trv['last_updated']) ? $trv['last_updated'] : null
            );
        }

        // Prepare response
        $response = array(
            'room_id'       => $room_id,
            'room_name'     => $site_name,
            'room_state'    => $room_state ? $room_state['state'] : null,
            'should_heat'   => $should_heat ? ($should_heat['state'] === 'on') : false,
            'arrival'       => $arrival ? $arrival['state'] : null,
            'departure'     => $departure ? $departure['state'] : null,
            'heating_start' => $heating_start ? $heating_start['state'] : null,
            'trvs'          => $trv_details,
            'can_control'   => wfa_user_can('heating_control')
        );

        // Add booking info if enabled and permission
        if (!empty($settings['show_booking_info'])) {
            $response['booking'] = array(
                'guest_name'     => $guest_name ? $guest_name['state'] : null,
                'arrival'        => $arrival ? $arrival['state'] : null,
                'departure'      => $departure ? $departure['state'] : null,
                'heating_start'  => $heating_start ? $heating_start['state'] : null,
                'cooling_start'  => $cooling_start ? $cooling_start['state'] : null
            );
        }

        wp_send_json_success($response);
    }

    /**
     * Set TRV temperature
     */
    public function set_temperature() {
        check_ajax_referer('hhrh_nonce', 'nonce');

        // Check permission
        if (!wfa_user_can('heating_control')) {
            wp_send_json_error(array(
                'message' => __('You do not have permission to control room heating.', 'hhrh')
            ));
        }

        $entity_id = isset($_POST['entity_id']) ? sanitize_text_field($_POST['entity_id']) : '';
        $temperature = isset($_POST['temperature']) ? (float)$_POST['temperature'] : 0;
        $location_id = isset($_POST['location_id']) ? (int)$_POST['location_id'] : hha_get_current_location();

        if (empty($entity_id) || $temperature <= 0) {
            wp_send_json_error(array(
                'message' => __('Invalid parameters.', 'hhrh')
            ));
        }

        // Call Home Assistant service
        $ha_api = new HHRH_HA_API($location_id);
        $result = $ha_api->call_service('climate', 'set_temperature', array(
            'entity_id'   => $entity_id,
            'temperature' => $temperature
        ));

        if (is_wp_error($result)) {
            wp_send_json_error(array(
                'message' => $result->get_error_message()
            ));
        }

        wp_send_json_success(array(
            'message' => __('Temperature updated successfully.', 'hhrh')
        ));
    }

    /**
     * Verify temperature was set correctly
     */
    public function verify_temperature() {
        check_ajax_referer('hhrh_nonce', 'nonce');

        // Check permission
        if (!wfa_user_can('heating_view')) {
            wp_send_json_error(array(
                'message' => __('You do not have permission to view room heating data.', 'hhrh')
            ));
        }

        $entity_id = isset($_POST['entity_id']) ? sanitize_text_field($_POST['entity_id']) : '';
        $expected_temp = isset($_POST['expected_temp']) ? (float)$_POST['expected_temp'] : null;
        $location_id = isset($_POST['location_id']) ? (int)$_POST['location_id'] : hha_get_current_location();

        if (empty($entity_id)) {
            wp_send_json_error(array(
                'message' => __('Invalid parameters.', 'hhrh')
            ));
        }

        // Get current state from Home Assistant
        $ha_api = new HHRH_HA_API($location_id);
        $all_states = $ha_api->get_states(false); // Don't use cache

        if (is_wp_error($all_states)) {
            wp_send_json_error(array(
                'message' => $all_states->get_error_message()
            ));
        }

        // Find the climate entity
        $entity = $ha_api->find_state($all_states, $entity_id);

        if (!$entity) {
            wp_send_json_error(array(
                'message' => __('Entity not found.', 'hhrh')
            ));
        }

        // Get climate's actual target temperature
        $climate_target = isset($entity['attributes']['temperature']) ? (float)$entity['attributes']['temperature'] : null;

        // Get command target temperature sensor
        $trv_base = str_replace('climate.', '', $entity_id);
        $command_sensor = $ha_api->find_state($all_states, "sensor.{$trv_base}_trv_target_temperature");
        $command_target = $command_sensor ? (float)$command_sensor['state'] : null;

        // Check if climate has updated to expected temperature
        $climate_confirmed = ($climate_target !== null && $expected_temp !== null && abs($climate_target - $expected_temp) < 0.1);

        // Check if command sensor has the expected temperature (valve sleeping scenario)
        $command_confirmed = ($command_target !== null && $expected_temp !== null && abs($command_target - $expected_temp) < 0.1);

        wp_send_json_success(array(
            'entity_id'         => $entity_id,
            'climate_target'    => $climate_target,
            'command_target'    => $command_target,
            'expected_temp'     => $expected_temp,
            'climate_confirmed' => $climate_confirmed,
            'command_confirmed' => $command_confirmed
        ));
    }

    /**
     * Test Home Assistant connection (admin)
     */
    public function test_ha_connection() {
        check_ajax_referer('hhrh_admin_nonce', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error(array(
                'message' => __('Permission denied.', 'hhrh')
            ));
        }

        $location_id = isset($_POST['location_id']) ? (int)$_POST['location_id'] : 0;
        $ha_url = isset($_POST['ha_url']) ? sanitize_text_field($_POST['ha_url']) : '';
        $ha_token = isset($_POST['ha_token']) ? sanitize_text_field($_POST['ha_token']) : '';

        // Create HA API instance and set credentials from form
        $ha_api = new HHRH_HA_API($location_id);
        if (!empty($ha_url) && !empty($ha_token)) {
            $ha_api->set_credentials($ha_url, $ha_token);
        }

        $result = $ha_api->test_connection();

        if ($result['success']) {
            wp_send_json_success($result);
        } else {
            wp_send_json_error($result);
        }
    }

    /**
     * Save settings (admin)
     */
    public function save_settings() {
        check_ajax_referer('hhrh_save_settings', 'hhrh_settings_nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error(array(
                'message' => __('Permission denied.', 'hhrh')
            ));
        }

        $location_id = isset($_POST['hotel_id']) ? (int)$_POST['hotel_id'] : 0;

        $settings = array(
            'enabled'                  => isset($_POST['enabled']),
            'ha_url'                   => isset($_POST['ha_url']) ? $_POST['ha_url'] : '',
            'ha_token'                 => isset($_POST['ha_token']) ? $_POST['ha_token'] : '',
            'refresh_interval'         => isset($_POST['refresh_interval']) ? (int)$_POST['refresh_interval'] : 30,
            'show_booking_info'        => isset($_POST['show_booking_info']),
            'alert_threshold_temp'     => isset($_POST['alert_threshold_temp']) ? (float)$_POST['alert_threshold_temp'] : 10,
            'battery_warning_percent'  => isset($_POST['battery_warning_percent']) ? (int)$_POST['battery_warning_percent'] : 30,
            'battery_critical_percent' => isset($_POST['battery_critical_percent']) ? (int)$_POST['battery_critical_percent'] : 15
        );

        // Validate settings
        $validated = HHRH_Settings::validate($settings);

        // Save settings
        $saved = HHRH_Settings::save($location_id, $validated);

        if ($saved) {
            wp_send_json_success(array(
                'message' => __('Settings saved successfully.', 'hhrh')
            ));
        } else {
            wp_send_json_error(array(
                'message' => __('Failed to save settings.', 'hhrh')
            ));
        }
    }
}
