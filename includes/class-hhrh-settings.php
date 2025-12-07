<?php
/**
 * Settings Class
 *
 * @package HotelHub_Management_RoomHeating
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Settings management class
 */
class HHRH_Settings {

    /**
     * Singleton instance
     */
    private static $instance = null;

    /**
     * Settings option name
     */
    const OPTION_NAME = 'hhrh_location_settings';

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
        // Settings are managed by the Admin class
    }

    /**
     * Get all location settings
     *
     * @return array All settings
     */
    public static function get_all() {
        return get_option(self::OPTION_NAME, array());
    }

    /**
     * Get settings for a specific location
     *
     * @param int $location_id Location ID
     * @return array Location settings
     */
    public static function get($location_id) {
        $all_settings = self::get_all();

        if (isset($all_settings[$location_id])) {
            return $all_settings[$location_id];
        }

        // Return defaults if not set
        return self::get_defaults();
    }

    /**
     * Save settings for a specific location
     *
     * @param int $location_id Location ID
     * @param array $settings Settings to save
     * @return bool True on success, false on failure
     */
    public static function save($location_id, $settings) {
        $all_settings = self::get_all();
        $all_settings[$location_id] = array_merge(self::get_defaults(), $settings);

        // update_option returns false if value unchanged, but that's not a failure
        // So we'll always return true unless there's an actual error
        $result = update_option(self::OPTION_NAME, $all_settings);

        // If update_option returned false, check if it's because the value didn't change
        if ($result === false) {
            // Get the current value and compare
            $current = get_option(self::OPTION_NAME, array());
            // If current matches what we tried to save, it's not an error
            if ($current === $all_settings) {
                return true;
            }
        }

        return $result;
    }

    /**
     * Delete settings for a specific location
     *
     * @param int $location_id Location ID
     * @return bool True on success, false on failure
     */
    public static function delete($location_id) {
        $all_settings = self::get_all();

        if (isset($all_settings[$location_id])) {
            unset($all_settings[$location_id]);
            return update_option(self::OPTION_NAME, $all_settings);
        }

        return false;
    }

    /**
     * Get default settings
     *
     * @return array Default settings
     */
    public static function get_defaults() {
        return array(
            'enabled'               => false,
            'ha_url'                => '',
            'ha_token'              => '',
            'refresh_interval'      => 30,
            'show_booking_info'     => false,
            'alert_threshold_temp'  => 10
        );
    }

    /**
     * Validate settings
     *
     * @param array $settings Settings to validate
     * @return array Validated settings
     */
    public static function validate($settings) {
        $validated = array();

        // Enabled
        $validated['enabled'] = !empty($settings['enabled']);

        // HA URL
        if (isset($settings['ha_url'])) {
            $validated['ha_url'] = esc_url_raw($settings['ha_url']);
        }

        // HA Token
        if (isset($settings['ha_token'])) {
            $validated['ha_token'] = sanitize_text_field($settings['ha_token']);
        }

        // Refresh interval (15-300 seconds)
        if (isset($settings['refresh_interval'])) {
            $interval = (int)$settings['refresh_interval'];
            $validated['refresh_interval'] = max(15, min(300, $interval));
        }

        // Show booking info
        $validated['show_booking_info'] = !empty($settings['show_booking_info']);

        // Alert threshold temperature (5-20°C)
        if (isset($settings['alert_threshold_temp'])) {
            $threshold = (float)$settings['alert_threshold_temp'];
            $validated['alert_threshold_temp'] = max(5, min(20, $threshold));
        }

        return $validated;
    }
}
