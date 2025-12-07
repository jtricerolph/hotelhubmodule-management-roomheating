<?php
/**
 * Admin Settings Page View
 *
 * @package HotelHub_Management_RoomHeating
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}
?>

<div class="wrap hhrh-admin-wrap">
    <h1><?php _e('Room Heating Settings', 'hhrh'); ?></h1>

    <!-- Hotel Tabs -->
    <h2 class="nav-tab-wrapper">
        <?php foreach ($hotels as $hotel) : ?>
            <a href="?page=hhrh-settings&hotel=<?php echo esc_attr($hotel->id); ?>"
               class="nav-tab <?php echo ($hotel->id == $active_hotel) ? 'nav-tab-active' : ''; ?>">
                <?php echo esc_html($hotel->name); ?>
            </a>
        <?php endforeach; ?>
    </h2>

    <div class="hhrh-settings-container">
        <form id="hhrh-settings-form" method="post">
            <?php wp_nonce_field('hhrh_save_settings', 'hhrh_settings_nonce'); ?>
            <input type="hidden" name="hotel_id" value="<?php echo esc_attr($active_hotel); ?>">

            <table class="form-table" role="presentation">
                <!-- Enable Module -->
                <tr>
                    <th scope="row">
                        <label for="hhrh_enabled">
                            <?php _e('Enable Module', 'hhrh'); ?>
                        </label>
                    </th>
                    <td>
                        <label class="hhrh-toggle">
                            <input type="checkbox"
                                   id="hhrh_enabled"
                                   name="enabled"
                                   value="1"
                                   <?php checked(!empty($settings['enabled'])); ?>>
                            <span class="hhrh-toggle-slider"></span>
                        </label>
                        <p class="description">
                            <?php _e('Enable room heating monitoring for this location.', 'hhrh'); ?>
                        </p>
                    </td>
                </tr>

                <!-- Home Assistant URL -->
                <tr>
                    <th scope="row">
                        <label for="hhrh_ha_url">
                            <?php _e('Home Assistant URL', 'hhrh'); ?>
                        </label>
                    </th>
                    <td>
                        <input type="url"
                               id="hhrh_ha_url"
                               name="ha_url"
                               value="<?php echo esc_attr($settings['ha_url']); ?>"
                               class="regular-text"
                               placeholder="http://homeassistant.local:8123">
                        <p class="description">
                            <?php _e('Full URL to your Home Assistant instance (e.g., http://homeassistant.local:8123)', 'hhrh'); ?>
                        </p>
                    </td>
                </tr>

                <!-- Access Token -->
                <tr>
                    <th scope="row">
                        <label for="hhrh_ha_token">
                            <?php _e('Access Token', 'hhrh'); ?>
                        </label>
                    </th>
                    <td>
                        <input type="password"
                               id="hhrh_ha_token"
                               name="ha_token"
                               value="<?php echo esc_attr($settings['ha_token']); ?>"
                               class="regular-text">
                        <p class="description">
                            <?php _e('Long-lived access token from Home Assistant. Create in your Home Assistant profile.', 'hhrh'); ?>
                        </p>
                        <button type="button" id="hhrh-test-connection" class="button">
                            <span class="material-symbols-outlined">wifi</span>
                            <?php _e('Test Connection', 'hhrh'); ?>
                        </button>
                        <span id="hhrh-connection-status"></span>
                    </td>
                </tr>

                <!-- Refresh Interval -->
                <tr>
                    <th scope="row">
                        <label for="hhrh_refresh_interval">
                            <?php _e('Refresh Interval', 'hhrh'); ?>
                        </label>
                    </th>
                    <td>
                        <input type="number"
                               id="hhrh_refresh_interval"
                               name="refresh_interval"
                               value="<?php echo esc_attr($settings['refresh_interval']); ?>"
                               min="15"
                               max="300"
                               step="15"
                               class="small-text">
                        <span><?php _e('seconds', 'hhrh'); ?></span>
                        <p class="description">
                            <?php _e('How often to poll Home Assistant for updates (15-300 seconds).', 'hhrh'); ?>
                        </p>
                    </td>
                </tr>

                <!-- Show Booking Info -->
                <tr>
                    <th scope="row">
                        <label for="hhrh_show_booking_info">
                            <?php _e('Show Booking Info', 'hhrh'); ?>
                        </label>
                    </th>
                    <td>
                        <label class="hhrh-toggle">
                            <input type="checkbox"
                                   id="hhrh_show_booking_info"
                                   name="show_booking_info"
                                   value="1"
                                   <?php checked(!empty($settings['show_booking_info'])); ?>>
                            <span class="hhrh-toggle-slider"></span>
                        </label>
                        <p class="description">
                            <?php _e('Display guest names and booking information in room details (requires appropriate permissions).', 'hhrh'); ?>
                        </p>
                    </td>
                </tr>

                <!-- Alert Threshold -->
                <tr>
                    <th scope="row">
                        <label for="hhrh_alert_threshold_temp">
                            <?php _e('Alert Threshold Temperature', 'hhrh'); ?>
                        </label>
                    </th>
                    <td>
                        <input type="number"
                               id="hhrh_alert_threshold_temp"
                               name="alert_threshold_temp"
                               value="<?php echo esc_attr($settings['alert_threshold_temp']); ?>"
                               min="5"
                               max="20"
                               step="0.5"
                               class="small-text">
                        <span>°C</span>
                        <p class="description">
                            <?php _e('Show alert if room temperature falls below this value (5-20°C).', 'hhrh'); ?>
                        </p>
                    </td>
                </tr>

                <!-- Battery Warning Threshold -->
                <tr>
                    <th scope="row">
                        <label for="hhrh_battery_warning_percent">
                            <?php _e('Battery Warning Level', 'hhrh'); ?>
                        </label>
                    </th>
                    <td>
                        <input type="number"
                               id="hhrh_battery_warning_percent"
                               name="battery_warning_percent"
                               value="<?php echo esc_attr($settings['battery_warning_percent']); ?>"
                               min="10"
                               max="50"
                               step="1"
                               class="small-text">
                        <span>%</span>
                        <p class="description">
                            <?php _e('Show amber warning if any TRV battery falls below this level (10-50%).', 'hhrh'); ?>
                        </p>
                    </td>
                </tr>

                <!-- Battery Critical Threshold -->
                <tr>
                    <th scope="row">
                        <label for="hhrh_battery_critical_percent">
                            <?php _e('Battery Critical Level', 'hhrh'); ?>
                        </label>
                    </th>
                    <td>
                        <input type="number"
                               id="hhrh_battery_critical_percent"
                               name="battery_critical_percent"
                               value="<?php echo esc_attr($settings['battery_critical_percent']); ?>"
                               min="5"
                               max="30"
                               step="1"
                               class="small-text">
                        <span>%</span>
                        <p class="description">
                            <?php _e('Show red alert if any TRV battery falls below this level (5-30%).', 'hhrh'); ?>
                        </p>
                    </td>
                </tr>
            </table>

            <?php submit_button(__('Save Settings', 'hhrh'), 'primary', 'submit', true); ?>

            <div id="hhrh-save-message" class="notice" style="display:none;"></div>
        </form>
    </div>
</div>

<style>
.hhrh-admin-wrap {
    max-width: 1200px;
}

.hhrh-settings-container {
    background: #fff;
    padding: 20px;
    margin-top: 20px;
    border: 1px solid #ccd0d4;
    box-shadow: 0 1px 1px rgba(0,0,0,0.04);
}

.hhrh-toggle {
    position: relative;
    display: inline-block;
    width: 50px;
    height: 24px;
}

.hhrh-toggle input {
    opacity: 0;
    width: 0;
    height: 0;
}

.hhrh-toggle-slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #ccc;
    transition: .4s;
    border-radius: 24px;
}

.hhrh-toggle-slider:before {
    position: absolute;
    content: "";
    height: 18px;
    width: 18px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: .4s;
    border-radius: 50%;
}

.hhrh-toggle input:checked + .hhrh-toggle-slider {
    background-color: #2271b1;
}

.hhrh-toggle input:checked + .hhrh-toggle-slider:before {
    transform: translateX(26px);
}

#hhrh-test-connection {
    margin-top: 10px;
}

#hhrh-test-connection .material-symbols-outlined {
    font-size: 18px;
    vertical-align: middle;
    margin-right: 5px;
}

#hhrh-connection-status {
    margin-left: 10px;
    font-weight: bold;
}

#hhrh-connection-status.success {
    color: #46b450;
}

#hhrh-connection-status.error {
    color: #dc3232;
}
</style>
