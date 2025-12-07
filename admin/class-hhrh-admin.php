<?php
/**
 * Admin Class
 *
 * @package HotelHub_Management_RoomHeating
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Admin functionality class
 */
class HHRH_Admin {

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
        // Admin initialization if needed
    }

    /**
     * Render settings page
     */
    public static function render_settings() {
        // Check user capabilities
        if (!current_user_can('manage_options')) {
            wp_die(__('You do not have permission to access this page.', 'hhrh'));
        }

        // Get all hotels
        if (!function_exists('hha') || !isset(hha()->hotels)) {
            echo '<div class="wrap">';
            echo '<h1>' . __('Room Heating Settings', 'hhrh') . '</h1>';
            echo '<div class="notice notice-error"><p>' . __('Hotel Hub App is not active.', 'hhrh') . '</p></div>';
            echo '</div>';
            return;
        }

        $hotels = hha()->hotels->get_all();

        if (empty($hotels)) {
            echo '<div class="wrap">';
            echo '<h1>' . __('Room Heating Settings', 'hhrh') . '</h1>';
            echo '<div class="notice notice-warning"><p>' . __('No hotels configured. Please add hotels in Hotel Hub settings first.', 'hhrh') . '</p></div>';
            echo '</div>';
            return;
        }

        // Get current tab (hotel ID)
        $active_hotel = isset($_GET['hotel']) ? (int)$_GET['hotel'] : $hotels[0]->id;

        // Get settings for active hotel
        $settings = HHRH_Settings::get($active_hotel);

        // Include the settings view
        include HHRH_PLUGIN_DIR . 'admin/views/settings.php';
    }
}
