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

                $room_update = $this->get_room_update($site, $all_states, $ha_api);

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
     * @return array|null Room update or null
     */
    private function get_room_update($site, $all_states, $ha_api) {
        $normalized_name = $ha_api->normalize_site_name($site['site_name']);

        // Get key entities
        $should_heat = $ha_api->find_state($all_states, "binary_sensor.{$normalized_name}_should_heat");
        $room_state = $ha_api->find_state($all_states, "sensor.{$normalized_name}_room_state");

        // Get TRVs
        $trvs = $ha_api->find_trvs($all_states, $site['site_id']);

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

        // Build TRV data
        $trv_data = array();
        foreach ($trvs as $trv) {
            $trv_data[] = array(
                'entity_id'    => $trv['entity_id'],
                'current_temp' => isset($trv['attributes']['current_temperature']) ? (float)$trv['attributes']['current_temperature'] : null,
                'target_temp'  => isset($trv['attributes']['temperature']) ? (float)$trv['attributes']['temperature'] : null
            );
        }

        return array(
            'room_id'        => $site['site_id'],
            'heating_status' => $heating_status,
            'room_state'     => $room_state ? $room_state['state'] : null,
            'avg_temperature' => $avg_temp,
            'trvs'           => $trv_data
        );
    }
}
