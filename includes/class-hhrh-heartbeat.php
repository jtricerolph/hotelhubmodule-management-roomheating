<?php
/**
 * Heartbeat Class - Real-time updates
 *
 * @package HotelHub_Management_RoomHeating
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Heartbeat integration class for real-time updates
 */
class HHRH_Heartbeat {

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
        add_filter('heartbeat_received', array($this, 'heartbeat_received'), 10, 2);
    }

    /**
     * Handle heartbeat tick
     *
     * @param array $response Heartbeat response
     * @param array $data Heartbeat data from client
     * @return array Modified response
     */
    public function heartbeat_received($response, $data) {
        // Check if this is a room heating heartbeat request
        if (isset($data['hhrh_heartbeat'])) {
            $heartbeat_data = $data['hhrh_heartbeat'];

            // Check permission
            if (!wfa_user_can('heating_view')) {
                return $response;
            }

            $location_id = isset($heartbeat_data['location_id']) ? (int)$heartbeat_data['location_id'] : hha_get_current_location();
            $last_update = isset($heartbeat_data['last_update']) ? (int)$heartbeat_data['last_update'] : 0;

            // Get room updates
            $updates = $this->get_room_updates($location_id);

            if ($updates) {
                $response['hhrh_heartbeat'] = array(
                    'updates'   => $updates,
                    'timestamp' => current_time('timestamp')
                );
            }
        }

        return $response;
    }

    /**
     * Get room updates
     *
     * @param int $location_id Location ID
     * @return array|null Room updates or null
     */
    private function get_room_updates($location_id) {
        // Get cached sites from hotel hub app
        $integration = hha()->integrations->get_settings($location_id, 'newbook');
        $categories = isset($integration['categories_sort']) ? $integration['categories_sort'] : array();

        // Get settings for battery thresholds
        $settings = HHRH_Settings::get($location_id);

        // Get Home Assistant API client
        $ha_api = new HHRH_HA_API($location_id);

        // Get all HA states (don't use cache for heartbeat)
        $all_states = $ha_api->get_states(false);

        if (is_wp_error($all_states)) {
            return null;
        }

        // Collect updates for each room
        $updates = array();

        foreach ($categories as $category) {
            if (!empty($category['excluded'])) {
                continue;
            }

            foreach ($category['sites'] as $site) {
                if (!empty($site['excluded'])) {
                    continue;
                }

                $room_update = $this->get_room_update($site, $all_states, $ha_api, $settings);

                if ($room_update) {
                    $updates[] = $room_update;
                }
            }
        }

        return $updates;
    }

    /**
     * Get update for a single room
     *
     * @param array $site Site data
     * @param array $all_states All HA states
     * @param HHRH_HA_API $ha_api HA API client
     * @param array $settings Settings with battery thresholds
     * @return array|null Room update or null
     */
    private function get_room_update($site, $all_states, $ha_api, $settings) {
        $normalized_name = $ha_api->normalize_site_name($site['site_name']);
        $room_number = $ha_api->extract_room_number($site['site_name']);

        // Get key entities
        $should_heat = $ha_api->find_state($all_states, "binary_sensor.{$normalized_name}_should_heat");
        $room_state = $ha_api->find_state($all_states, "sensor.{$normalized_name}_room_state");

        // Get TRVs using room number from site_name
        $trvs = $ha_api->find_trvs($all_states, $room_number);

        // Determine heating status
        $heating_status = 'idle';
        if (!empty($trvs)) {
            if ($should_heat && $should_heat['state'] === 'on') {
                $heating_status = 'heating';
            }
        } else {
            $heating_status = 'error';
        }

        // Calculate average temperature
        $avg_temp = $ha_api->calculate_avg_temp($trvs);

        // Build TRV data and check battery levels
        $trv_data = array();
        $battery_status = 'ok';
        $min_battery = 100;

        foreach ($trvs as $trv) {
            // Get battery level
            $trv_base = str_replace('climate.', '', $trv['entity_id']);
            $battery_entity = $ha_api->find_state($all_states, "sensor.{$trv_base}_trv_battery");
            $battery_level = $battery_entity ? (int)$battery_entity['state'] : null;

            if ($battery_level !== null && $battery_level < $min_battery) {
                $min_battery = $battery_level;
            }

            $trv_data[] = array(
                'entity_id'    => $trv['entity_id'],
                'current_temp' => isset($trv['attributes']['current_temperature']) ? (float)$trv['attributes']['current_temperature'] : null,
                'target_temp'  => isset($trv['attributes']['temperature']) ? (float)$trv['attributes']['temperature'] : null,
                'battery'      => $battery_level
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
            'heating_status'  => $heating_status,
            'room_state'      => $room_state ? $room_state['state'] : null,
            'avg_temperature' => $avg_temp,
            'battery_status'  => $battery_status,
            'min_battery'     => $min_battery < 100 ? $min_battery : null,
            'trvs'            => $trv_data
        );
    }
}
