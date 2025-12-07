<?php
/**
 * Home Assistant API Client
 *
 * @package HotelHub_Management_RoomHeating
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Home Assistant API Client Class
 */
class HHRH_HA_API {

    /**
     * Home Assistant URL
     *
     * @var string
     */
    private $ha_url;

    /**
     * Access Token
     *
     * @var string
     */
    private $token;

    /**
     * Location ID
     *
     * @var int
     */
    private $location_id;

    /**
     * Cache duration in seconds
     *
     * @var int
     */
    private $cache_duration;

    /**
     * Constructor
     *
     * @param int $location_id Location ID
     */
    public function __construct($location_id = null) {
        $this->location_id = $location_id ?: hha_get_current_location();
        $this->load_settings();
    }

    /**
     * Load settings from database
     */
    private function load_settings() {
        $settings = $this->get_location_settings();

        $this->ha_url = isset($settings['ha_url']) ? rtrim($settings['ha_url'], '/') : '';
        $this->token = isset($settings['ha_token']) ? $settings['ha_token'] : '';
        $this->cache_duration = isset($settings['refresh_interval']) ? (int)$settings['refresh_interval'] : 30;
    }

    /**
     * Get location settings
     *
     * @return array Settings array
     */
    public function get_location_settings() {
        $all_settings = get_option('hhrh_location_settings', array());
        return isset($all_settings[$this->location_id]) ? $all_settings[$this->location_id] : array();
    }

    /**
     * Set credentials for testing
     *
     * @param string $url Home Assistant URL
     * @param string $token Access token
     */
    public function set_credentials($url, $token) {
        $this->ha_url = rtrim($url, '/');
        $this->token = $token;
    }

    /**
     * Test connection to Home Assistant
     *
     * @return array Result array with success/error
     */
    public function test_connection() {
        if (empty($this->ha_url) || empty($this->token)) {
            return array(
                'success' => false,
                'message' => __('URL and token are required.', 'hhrh')
            );
        }

        $response = $this->make_request('/api/');

        if (is_wp_error($response)) {
            return array(
                'success' => false,
                'message' => $response->get_error_message()
            );
        }

        if (isset($response['message']) && $response['message'] === 'API running.') {
            return array(
                'success' => true,
                'message' => __('Connected successfully!', 'hhrh'),
                'version' => isset($response['version']) ? $response['version'] : 'Unknown'
            );
        }

        return array(
            'success' => false,
            'message' => __('Unexpected response from Home Assistant.', 'hhrh')
        );
    }

    /**
     * Get all entity states
     *
     * @param bool $use_cache Whether to use cached data
     * @return array|WP_Error Array of entity states or WP_Error on failure
     */
    public function get_states($use_cache = true) {
        $cache_key = 'hhrh_ha_states_' . $this->location_id;

        if ($use_cache) {
            $cached = get_transient($cache_key);
            if ($cached !== false) {
                return $cached;
            }
        }

        $response = $this->make_request('/api/states');

        if (is_wp_error($response)) {
            return $response;
        }

        // Cache the response
        if (is_array($response)) {
            set_transient($cache_key, $response, $this->cache_duration);
        }

        return $response;
    }

    /**
     * Get single entity state
     *
     * @param string $entity_id Entity ID
     * @param bool $use_cache Whether to use cached data
     * @return array|WP_Error Entity state or WP_Error on failure
     */
    public function get_state($entity_id, $use_cache = true) {
        $cache_key = 'hhrh_ha_state_' . $this->location_id . '_' . md5($entity_id);

        if ($use_cache) {
            $cached = get_transient($cache_key);
            if ($cached !== false) {
                return $cached;
            }
        }

        $response = $this->make_request('/api/states/' . $entity_id);

        if (is_wp_error($response)) {
            return $response;
        }

        // Cache the response
        if (is_array($response)) {
            set_transient($cache_key, $response, $this->cache_duration);
        }

        return $response;
    }

    /**
     * Call a service
     *
     * @param string $domain Service domain (e.g., 'climate')
     * @param string $service Service name (e.g., 'set_temperature')
     * @param array $data Service data
     * @return array|WP_Error Service response or WP_Error on failure
     */
    public function call_service($domain, $service, $data = array()) {
        $endpoint = sprintf('/api/services/%s/%s', $domain, $service);

        $response = $this->make_request($endpoint, 'POST', $data);

        // Clear cache when making changes
        if (!is_wp_error($response)) {
            $this->clear_cache();
        }

        return $response;
    }

    /**
     * Make HTTP request to Home Assistant
     *
     * @param string $endpoint API endpoint
     * @param string $method HTTP method (GET or POST)
     * @param array $body Request body for POST requests
     * @return array|WP_Error Response data or WP_Error on failure
     */
    private function make_request($endpoint, $method = 'GET', $body = null) {
        if (empty($this->ha_url) || empty($this->token)) {
            return new WP_Error(
                'ha_not_configured',
                __('Home Assistant is not configured.', 'hhrh')
            );
        }

        $url = $this->ha_url . $endpoint;

        $args = array(
            'method'  => $method,
            'timeout' => 30,
            'headers' => array(
                'Authorization' => 'Bearer ' . $this->token,
                'Content-Type'  => 'application/json'
            )
        );

        if ($method === 'POST' && $body !== null) {
            $args['body'] = json_encode($body);
        }

        $response = wp_remote_request($url, $args);

        if (is_wp_error($response)) {
            error_log('HHRH HA API Error: ' . $response->get_error_message());
            return $response;
        }

        $code = wp_remote_retrieve_response_code($response);
        $data = wp_remote_retrieve_body($response);

        // Handle HTTP errors
        if ($code >= 400) {
            $error_message = sprintf(
                __('Home Assistant returned error %d: %s', 'hhrh'),
                $code,
                $data
            );
            error_log('HHRH HA API Error: ' . $error_message);
            return new WP_Error('ha_http_error', $error_message);
        }

        // Parse JSON response
        $decoded = json_decode($data, true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            error_log('HHRH HA API JSON Error: ' . json_last_error_msg());
            return new WP_Error(
                'ha_json_error',
                __('Invalid JSON response from Home Assistant.', 'hhrh')
            );
        }

        return $decoded;
    }

    /**
     * Find entity state in states array
     *
     * @param array $states All states
     * @param string $entity_id Entity ID to find
     * @return array|null Entity state or null if not found
     */
    public function find_state($states, $entity_id) {
        foreach ($states as $state) {
            if (isset($state['entity_id']) && $state['entity_id'] === $entity_id) {
                return $state;
            }
        }
        return null;
    }

    /**
     * Find TRVs for a specific room
     *
     * @param array $states All states
     * @param string $room_number Room number (e.g., '101')
     * @return array Array of TRV entities
     */
    public function find_trvs($states, $room_number) {
        $trvs = array();
        // Match climate entities for this room (removed _trv requirement)
        $pattern = '/^climate\.room_' . preg_quote($room_number, '/') . '_/';

        // Debug: Log what we're searching for
        error_log(sprintf('[HHRH] Looking for TRVs with pattern: %s (room_number: %s)', $pattern, $room_number));

        // Debug: Log first few climate entities we find
        $climate_entities = array();
        foreach ($states as $state) {
            if (isset($state['entity_id']) && strpos($state['entity_id'], 'climate.') === 0) {
                $climate_entities[] = $state['entity_id'];
                if (count($climate_entities) <= 10) {
                    error_log(sprintf('[HHRH] Found climate entity: %s', $state['entity_id']));
                }
            }

            if (isset($state['entity_id']) && preg_match($pattern, $state['entity_id'])) {
                $trvs[] = $state;
                error_log(sprintf('[HHRH] MATCHED TRV: %s', $state['entity_id']));
            }
        }

        error_log(sprintf('[HHRH] Found %d TRVs for room %s out of %d total climate entities', count($trvs), $room_number, count($climate_entities)));

        return $trvs;
    }

    /**
     * Extract room number from site name
     *
     * @param string $site_name Site name (e.g., "Room 101", "101", etc.)
     * @return string Room number (e.g., "101")
     */
    public function extract_room_number($site_name) {
        // Extract all digits from site name
        if (preg_match('/\d+/', $site_name, $matches)) {
            return $matches[0];
        }
        return '';
    }

    /**
     * Calculate average temperature from TRVs
     *
     * @param array $trvs Array of TRV entities
     * @return float|null Average temperature or null if no valid temps
     */
    public function calculate_avg_temp($trvs) {
        $temps = array();

        foreach ($trvs as $trv) {
            if (isset($trv['attributes']['current_temperature'])) {
                $temp = (float)$trv['attributes']['current_temperature'];
                if ($temp > 0) {
                    $temps[] = $temp;
                }
            }
        }

        if (empty($temps)) {
            return null;
        }

        return round(array_sum($temps) / count($temps), 1);
    }

    /**
     * Normalize site name for entity ID
     *
     * @param string $site_name Site name from NewBook
     * @return string Normalized name for entity ID
     */
    public function normalize_site_name($site_name) {
        // Convert to lowercase and replace spaces with underscores
        $normalized = strtolower(str_replace(' ', '_', $site_name));

        // Remove any non-alphanumeric characters except underscores
        $normalized = preg_replace('/[^a-z0-9_]/', '', $normalized);

        return $normalized;
    }

    /**
     * Clear all cached data
     */
    public function clear_cache() {
        delete_transient('hhrh_ha_states_' . $this->location_id);

        // Note: Individual entity caches will expire naturally
        // Could add more sophisticated cache clearing if needed
    }
}
