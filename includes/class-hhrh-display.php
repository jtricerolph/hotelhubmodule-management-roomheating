<?php
/**
 * Display Class - Frontend rendering
 *
 * @package HotelHub_Management_RoomHeating
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Display class for Room Heating module
 */
class HHRH_Display {

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
        // Constructor content if needed
    }

    /**
     * Render module content
     *
     * @param array $params Optional parameters
     */
    public function render($params = array()) {
        $location_id = hha_get_current_location();

        // Check if module is enabled for this location
        $settings = HHRH_Settings::get($location_id);

        if (empty($settings['enabled'])) {
            $this->render_not_enabled();
            return;
        }

        // Check if Home Assistant is configured
        if (empty($settings['ha_url']) || empty($settings['ha_token'])) {
            $this->render_not_configured();
            return;
        }

        // Render main interface
        $this->render_interface();
    }

    /**
     * Render not enabled message
     */
    private function render_not_enabled() {
        ?>
        <div class="hhrh-container">
            <div class="hhrh-message hhrh-message-warning">
                <span class="material-symbols-outlined">info</span>
                <div>
                    <h3><?php _e('Module Not Enabled', 'hhrh'); ?></h3>
                    <p><?php _e('Room heating monitoring is not enabled for this location. Please enable it in the settings.', 'hhrh'); ?></p>
                    <?php if (current_user_can('manage_options')) : ?>
                        <a href="<?php echo admin_url('admin.php?page=hhrh-settings'); ?>" class="button">
                            <?php _e('Go to Settings', 'hhrh'); ?>
                        </a>
                    <?php endif; ?>
                </div>
            </div>
        </div>
        <?php
    }

    /**
     * Render not configured message
     */
    private function render_not_configured() {
        ?>
        <div class="hhrh-container">
            <div class="hhrh-message hhrh-message-error">
                <span class="material-symbols-outlined">warning</span>
                <div>
                    <h3><?php _e('Home Assistant Not Configured', 'hhrh'); ?></h3>
                    <p><?php _e('Home Assistant URL and access token must be configured before using this module.', 'hhrh'); ?></p>
                    <?php if (current_user_can('manage_options')) : ?>
                        <a href="<?php echo admin_url('admin.php?page=hhrh-settings'); ?>" class="button">
                            <?php _e('Configure Settings', 'hhrh'); ?>
                        </a>
                    <?php endif; ?>
                </div>
            </div>
        </div>
        <?php
    }

    /**
     * Render main interface
     */
    private function render_interface() {
        ?>
        <div class="hhrh-container" id="hhrh-container">
            <!-- Header -->
            <div class="hhrh-header">
                <div class="hhrh-header-left">
                    <h2 class="hhrh-title">
                        <span class="material-symbols-outlined">thermostat</span>
                        <?php _e('Room Heating', 'hhrh'); ?>
                    </h2>
                </div>
                <div class="hhrh-header-right">
                    <button class="hhrh-header-btn" id="hhrh-settings-toggle" type="button">
                        <span class="material-symbols-outlined">tune</span>
                    </button>
                    <span class="hhrh-connection-status" id="hhrh-connection-indicator">
                        <span class="material-symbols-outlined">wifi</span>
                    </span>
                </div>
            </div>

            <!-- Controls Panel -->
            <div class="hhrh-controls" id="hhrh-controls" style="display:none;">
                <div class="hhrh-controls-section">
                    <button class="hhrh-view-toggle active" data-view="flat" type="button">
                        <span class="material-symbols-outlined">view_list</span>
                        <?php _e('Flat', 'hhrh'); ?>
                    </button>
                    <button class="hhrh-view-toggle" data-view="grouped" type="button">
                        <span class="material-symbols-outlined">view_module</span>
                        <?php _e('Grouped', 'hhrh'); ?>
                    </button>
                </div>

                <div class="hhrh-controls-section">
                    <button class="hhrh-filter-btn active" data-filter="all" type="button">
                        <?php _e('All', 'hhrh'); ?>
                    </button>
                    <button class="hhrh-filter-btn" data-filter="heating" type="button">
                        <span class="material-symbols-outlined">heat</span>
                        <?php _e('Heating', 'hhrh'); ?>
                    </button>
                    <button class="hhrh-filter-btn" data-filter="idle" type="button">
                        <span class="material-symbols-outlined">ac_unit</span>
                        <?php _e('Idle', 'hhrh'); ?>
                    </button>
                    <button class="hhrh-filter-btn" data-filter="error" type="button">
                        <span class="material-symbols-outlined">warning</span>
                        <?php _e('Error', 'hhrh'); ?>
                    </button>
                </div>
            </div>

            <!-- Loading State -->
            <div class="hhrh-loading" id="hhrh-loading">
                <span class="material-symbols-outlined hhrh-spinner">progress_activity</span>
                <p><?php _e('Loading room heating data...', 'hhrh'); ?></p>
            </div>

            <!-- Error Message -->
            <div class="hhrh-error" id="hhrh-error" style="display:none;">
                <span class="material-symbols-outlined">error</span>
                <p id="hhrh-error-message"></p>
                <button class="button" id="hhrh-retry-btn" type="button">
                    <?php _e('Retry', 'hhrh'); ?>
                </button>
            </div>

            <!-- Rooms Container -->
            <div class="hhrh-rooms" id="hhrh-rooms" style="display:none;">
                <!-- Rooms will be dynamically loaded here -->
            </div>
        </div>

        <!-- Modal -->
        <div class="hhrh-modal-overlay" id="hhrh-modal" style="display:none;">
            <div class="hhrh-modal">
                <div class="hhrh-modal-header">
                    <h2 id="hhrh-modal-title"></h2>
                    <button class="hhrh-modal-close" id="hhrh-modal-close" type="button">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div class="hhrh-modal-body" id="hhrh-modal-body">
                    <div class="hhrh-loading">
                        <span class="material-symbols-outlined hhrh-spinner">progress_activity</span>
                        <p><?php _e('Loading room details...', 'hhrh'); ?></p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Notification Modal -->
        <div class="hhrh-notification-overlay" id="hhrh-notification" style="display:none;">
            <div class="hhrh-notification">
                <div class="hhrh-notification-icon" id="hhrh-notification-icon">
                    <span class="material-symbols-outlined"></span>
                </div>
                <div class="hhrh-notification-content">
                    <h3 id="hhrh-notification-title"></h3>
                    <p id="hhrh-notification-message"></p>
                </div>
                <button class="hhrh-notification-close" id="hhrh-notification-close" type="button">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
        </div>
        <?php
    }

    /**
     * Render room card (called by JavaScript)
     *
     * @param array $room Room data
     * @return string HTML for room card
     */
    public static function render_room_card($room) {
        ob_start();
        ?>
        <div class="hhrh-room-card"
             data-room-id="<?php echo esc_attr($room['room_id']); ?>"
             data-category="<?php echo esc_attr($room['category']); ?>"
             data-status="<?php echo esc_attr($room['heating_status']); ?>">

            <div class="hhrh-room-card-header">
                <div class="hhrh-room-number">
                    <?php echo esc_html($room['room_name']); ?>
                </div>
                <div class="hhrh-room-status hhrh-status-<?php echo esc_attr($room['heating_status']); ?>">
                    <span class="material-symbols-outlined">
                        <?php echo self::get_status_icon($room['heating_status']); ?>
                    </span>
                    <?php echo esc_html(self::get_status_label($room['heating_status'])); ?>
                </div>
            </div>

            <div class="hhrh-room-card-body">
                <?php if ($room['avg_temperature'] !== null) : ?>
                    <div class="hhrh-room-temp">
                        <span class="hhrh-temp-value"><?php echo esc_html($room['avg_temperature']); ?>°C</span>
                        <span class="hhrh-temp-label"><?php _e('Average', 'hhrh'); ?></span>
                    </div>
                <?php endif; ?>

                <?php if (!empty($room['trvs'])) : ?>
                    <div class="hhrh-room-trvs">
                        <?php foreach ($room['trvs'] as $trv) : ?>
                            <div class="hhrh-trv-item">
                                <span class="hhrh-trv-location"><?php echo esc_html($trv['location']); ?>:</span>
                                <span class="hhrh-trv-target"><?php echo esc_html($trv['target_temp']); ?>°C</span>
                            </div>
                        <?php endforeach; ?>
                    </div>
                <?php endif; ?>

                <?php if (!empty($room['room_state'])) : ?>
                    <div class="hhrh-room-state">
                        <?php echo esc_html(ucfirst(str_replace('_', ' ', $room['room_state']))); ?>
                    </div>
                <?php endif; ?>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * Get status icon name
     *
     * @param string $status Heating status
     * @return string Icon name
     */
    private static function get_status_icon($status) {
        switch ($status) {
            case 'heating':
                return 'heat';
            case 'idle':
                return 'ac_unit';
            case 'error':
                return 'warning';
            default:
                return 'help';
        }
    }

    /**
     * Get status label
     *
     * @param string $status Heating status
     * @return string Status label
     */
    private static function get_status_label($status) {
        switch ($status) {
            case 'heating':
                return __('Heating', 'hhrh');
            case 'idle':
                return __('Idle', 'hhrh');
            case 'error':
                return __('Error', 'hhrh');
            default:
                return __('Unknown', 'hhrh');
        }
    }
}
