<?php
/**
 * Plugin Name: Hotel Hub Module - Management - Room Heating
 * Plugin URI: https://github.com/jtricerolph/hotelhubmodule-management-roomheating
 * Description: Real-time room heating monitoring and control through Home Assistant integration
 * Version: 1.0.24
 * Author: JTR
 * License: GPL v2 or later
 * Text Domain: hhrh
 * Requires at least: 5.8
 * Requires PHP: 7.4
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

// Define plugin constants
define('HHRH_VERSION', '1.0.24');
define('HHRH_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('HHRH_PLUGIN_URL', plugin_dir_url(__FILE__));
define('HHRH_PLUGIN_BASENAME', plugin_basename(__FILE__));

/**
 * Main Plugin Class
 */
class HotelHub_Management_RoomHeating {

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
        $this->load_dependencies();
        $this->init_hooks();
    }

    /**
     * Check required plugin dependencies
     */
    private function check_dependencies() {
        // Check if Hotel Hub App is active
        if (!function_exists('hha')) {
            add_action('admin_notices', array($this, 'missing_hotel_hub_notice'));
            return false;
        }

        // Check if Workforce Authentication is active
        if (!function_exists('wfa_user_can')) {
            add_action('admin_notices', array($this, 'missing_workforce_auth_notice'));
            return false;
        }

        return true;
    }

    /**
     * Load required files
     */
    private function load_dependencies() {
        require_once HHRH_PLUGIN_DIR . 'includes/class-hhrh-core.php';
        require_once HHRH_PLUGIN_DIR . 'includes/class-hhrh-settings.php';
        require_once HHRH_PLUGIN_DIR . 'includes/class-hhrh-display.php';
        require_once HHRH_PLUGIN_DIR . 'includes/class-hhrh-ajax.php';
        require_once HHRH_PLUGIN_DIR . 'includes/class-hhrh-heartbeat.php';
        require_once HHRH_PLUGIN_DIR . 'includes/class-hhrh-ha-api.php';
        require_once HHRH_PLUGIN_DIR . 'admin/class-hhrh-admin.php';
    }

    /**
     * Initialize hooks
     */
    private function init_hooks() {
        register_activation_hook(__FILE__, array($this, 'activate'));
        register_deactivation_hook(__FILE__, array($this, 'deactivate'));

        // Initialize core functionality
        add_action('plugins_loaded', array($this, 'init'));
    }

    /**
     * Initialize plugin
     */
    public function init() {
        // Check dependencies again before initializing
        if (!$this->check_dependencies()) {
            return;
        }

        // Initialize core components
        HHRH_Core::instance();
    }

    /**
     * Activation hook
     */
    public function activate() {
        // Check if dependencies are available
        if (!function_exists('hha') || !function_exists('wfa_user_can')) {
            deactivate_plugins(plugin_basename(__FILE__));
            wp_die(
                __('This plugin requires Hotel Hub App and Workforce Authentication plugins to be installed and activated.', 'hhrh'),
                __('Plugin Activation Error', 'hhrh'),
                array('back_link' => true)
            );
        }

        flush_rewrite_rules();
    }

    /**
     * Deactivation hook
     */
    public function deactivate() {
        flush_rewrite_rules();
    }

    /**
     * Admin notice for missing Hotel Hub App
     */
    public function missing_hotel_hub_notice() {
        ?>
        <div class="notice notice-error">
            <p><?php _e('Hotel Hub Module - Room Heating requires the Hotel Hub App plugin to be installed and activated.', 'hhrh'); ?></p>
        </div>
        <?php
    }

    /**
     * Admin notice for missing Workforce Authentication
     */
    public function missing_workforce_auth_notice() {
        ?>
        <div class="notice notice-error">
            <p><?php _e('Hotel Hub Module - Room Heating requires the Workforce Authentication plugin to be installed and activated.', 'hhrh'); ?></p>
        </div>
        <?php
    }
}

/**
 * Get main plugin instance
 */
function hhrh() {
    return HotelHub_Management_RoomHeating::instance();
}

// Initialize the plugin
hhrh();
