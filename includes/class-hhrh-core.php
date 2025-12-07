<?php
/**
 * Core Class - Main functionality coordinator
 *
 * @package HotelHub_Management_RoomHeating
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Core class for Room Heating module
 */
class HHRH_Core {

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
        $this->init_components();
    }

    /**
     * Initialize WordPress hooks
     */
    private function init_hooks() {
        // Register module with Hotel Hub App
        add_filter('hha_register_modules', array($this, 'register_module'));

        // Register permissions with Workforce Authentication
        add_filter('wfa_register_permissions', array($this, 'register_permissions'));

        // Enqueue assets
        add_action('wp_enqueue_scripts', array($this, 'enqueue_assets'));
        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_assets'));
    }

    /**
     * Initialize sub-components
     */
    private function init_components() {
        HHRH_Settings::instance();
        HHRH_Display::instance();
        HHRH_Ajax::instance();
        HHRH_Heartbeat::instance();
        HHRH_Admin::instance();
    }

    /**
     * Register module with Hotel Hub App
     *
     * @param HHA_Modules $modules_manager HHA Modules manager object
     */
    public function register_module($modules_manager) {
        $modules_manager->register_module($this);
    }

    /**
     * Get module configuration
     *
     * Required by HHA_Modules
     *
     * @return array Module configuration
     */
    public function get_config() {
        return array(
            'id'             => 'room_heating',
            'name'           => __('Room Heating', 'hhrh'),
            'description'    => __('Real-time room heating monitoring and control', 'hhrh'),
            'department'     => 'management',
            'icon'           => 'thermostat',
            'color'          => '#f97316',
            'order'          => 15,
            'permissions'    => array(
                'heating_view',
                'heating_control'
            ),
            'requires_hotel' => true,
            'integrations'   => array('newbook'),
            'settings_pages' => array(
                array(
                    'slug'       => 'hhrh-settings',
                    'title'      => __('Room Heating Settings', 'hhrh'),
                    'menu_title' => __('Room Heating', 'hhrh'),
                    'callback'   => array('HHRH_Admin', 'render_settings')
                )
            )
        );
    }

    /**
     * Render module content
     *
     * Called by HHA_Modules when module is displayed
     *
     * @param array $params Optional parameters
     */
    public function render($params = array()) {
        // Check permission
        if (!wfa_user_can('heating_view')) {
            echo '<div class="hhrh-no-permission">';
            echo '<p>' . __('You do not have permission to view this module.', 'hhrh') . '</p>';
            echo '</div>';
            return;
        }

        // Delegate to Display class
        HHRH_Display::instance()->render($params);
    }

    /**
     * Register permissions with Workforce Authentication
     *
     * @param WFA_Permissions $permissions_manager WFA Permissions object
     */
    public function register_permissions($permissions_manager) {
        // Register permission: View room heating
        $permissions_manager->register_permission(
            'heating_view',
            __('View Room Heating', 'hhrh'),
            __('View room heating status and temperatures', 'hhrh'),
            'Room Heating'
        );

        // Register permission: Control room heating
        $permissions_manager->register_permission(
            'heating_control',
            __('Control Room Heating', 'hhrh'),
            __('Adjust room temperatures via thermostats', 'hhrh'),
            'Room Heating'
        );
    }

    /**
     * Enqueue frontend assets
     */
    public function enqueue_assets() {
        // For SPA architecture, always load on Hotel Hub pages
        if (!function_exists('hha')) {
            return;
        }

        // Only enqueue on Hotel Hub pages
        if (!is_page() && !is_singular()) {
            return;
        }

        // Material Symbols font (with display=block to prevent FOUT)
        wp_enqueue_style(
            'material-symbols-outlined',
            'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block',
            array(),
            null
        );

        // CSS
        wp_enqueue_style(
            'hhrh-room-heating',
            HHRH_PLUGIN_URL . 'assets/css/room-heating.css',
            array(),
            HHRH_VERSION
        );

        // JavaScript
        wp_enqueue_script(
            'hhrh-room-heating',
            HHRH_PLUGIN_URL . 'assets/js/room-heating.js',
            array('jquery', 'heartbeat'),
            HHRH_VERSION,
            true
        );

        // Localize script data
        $user_id = get_current_user_id();
        $location_id = hha_get_current_location();

        wp_localize_script('hhrh-room-heating', 'hhrhData', array(
            'ajaxUrl'     => admin_url('admin-ajax.php'),
            'nonce'       => wp_create_nonce('hhrh_nonce'),
            'userId'      => $user_id,
            'locationId'  => $location_id,
            'canControl'  => wfa_user_can('heating_control'),
            'canView'     => wfa_user_can('heating_view'),
            'strings'     => array(
                'error'           => __('An error occurred. Please try again.', 'hhrh'),
                'loading'         => __('Loading...', 'hhrh'),
                'noRooms'         => __('No rooms found.', 'hhrh'),
                'connectionError' => __('Unable to connect to Home Assistant.', 'hhrh'),
                'tempUpdated'     => __('Temperature updated successfully.', 'hhrh'),
                'tempUpdateFailed' => __('Failed to update temperature.', 'hhrh')
            )
        ));
    }

    /**
     * Enqueue admin assets
     */
    public function enqueue_admin_assets($hook) {
        // Only load on our settings pages
        if (strpos($hook, 'hhrh-settings') === false) {
            return;
        }

        // Material Symbols font
        wp_enqueue_style(
            'material-symbols-outlined',
            'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block',
            array(),
            null
        );

        // Admin CSS
        wp_enqueue_style(
            'hhrh-admin',
            HHRH_PLUGIN_URL . 'assets/css/admin.css',
            array(),
            HHRH_VERSION
        );

        // Admin JavaScript
        wp_enqueue_script(
            'hhrh-admin',
            HHRH_PLUGIN_URL . 'assets/js/admin.js',
            array('jquery'),
            HHRH_VERSION,
            true
        );

        // Localize admin script
        wp_localize_script('hhrh-admin', 'hhrhAdmin', array(
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce'   => wp_create_nonce('hhrh_admin_nonce'),
            'strings' => array(
                'testing'        => __('Testing connection...', 'hhrh'),
                'connected'      => __('Connected successfully!', 'hhrh'),
                'connectionFail' => __('Connection failed. Please check your settings.', 'hhrh'),
                'saved'          => __('Settings saved successfully.', 'hhrh'),
                'saveFailed'     => __('Failed to save settings.', 'hhrh')
            )
        ));
    }
}
