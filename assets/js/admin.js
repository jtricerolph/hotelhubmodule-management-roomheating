/**
 * Room Heating Module - Admin JavaScript
 */

(function($) {
    'use strict';

    const HHRHAdmin = {
        /**
         * Initialize
         */
        init: function() {
            this.bindEvents();
        },

        /**
         * Bind event listeners
         */
        bindEvents: function() {
            // Test connection button
            $('#hhrh-test-connection').on('click', function(e) {
                e.preventDefault();
                HHRHAdmin.testConnection();
            });

            // Save settings form
            $('#hhrh-settings-form').on('submit', function(e) {
                e.preventDefault();
                HHRHAdmin.saveSettings();
            });
        },

        /**
         * Test Home Assistant connection
         */
        testConnection: function() {
            const $btn = $('#hhrh-test-connection');
            const $status = $('#hhrh-connection-status');

            const url = $('#hhrh_ha_url').val();
            const token = $('#hhrh_ha_token').val();
            const hotelId = $('input[name="hotel_id"]').val();

            if (!url || !token) {
                $status.text('Please enter URL and token first.').removeClass('success').addClass('error');
                return;
            }

            // Disable button
            $btn.prop('disabled', true);
            $status.text(hhrhAdmin.strings.testing).removeClass('success error');

            // Save current settings temporarily for testing
            const currentSettings = HHRHAdmin.getCurrentSettings();

            $.ajax({
                url: hhrhAdmin.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'hhrh_test_ha_connection',
                    nonce: hhrhAdmin.nonce,
                    location_id: hotelId,
                    ha_url: url,
                    ha_token: token
                },
                success: function(response) {
                    if (response.success) {
                        $status.text(hhrhAdmin.strings.connected).addClass('success').removeClass('error');

                        if (response.data.version) {
                            $status.append(' (v' + response.data.version + ')');
                        }
                    } else {
                        $status.text(response.data.message || hhrhAdmin.strings.connectionFail).addClass('error').removeClass('success');
                    }
                },
                error: function() {
                    $status.text(hhrhAdmin.strings.connectionFail).addClass('error').removeClass('success');
                },
                complete: function() {
                    $btn.prop('disabled', false);
                }
            });
        },

        /**
         * Save settings
         */
        saveSettings: function() {
            const $form = $('#hhrh-settings-form');
            const $message = $('#hhrh-save-message');
            const $submitBtn = $form.find('input[type="submit"]');

            // Disable submit button
            $submitBtn.prop('disabled', true);

            // Serialize form data
            const formData = $form.serialize();

            $.ajax({
                url: hhrhAdmin.ajaxUrl,
                type: 'POST',
                data: formData + '&action=hhrh_save_settings',
                success: function(response) {
                    if (response.success) {
                        $message.removeClass('notice-error').addClass('notice-success');
                        $message.html('<p>' + hhrhAdmin.strings.saved + '</p>');
                    } else {
                        $message.removeClass('notice-success').addClass('notice-error');
                        $message.html('<p>' + (response.data.message || hhrhAdmin.strings.saveFailed) + '</p>');
                    }

                    $message.slideDown();

                    // Hide message after 3 seconds
                    setTimeout(function() {
                        $message.slideUp();
                    }, 3000);
                },
                error: function() {
                    $message.removeClass('notice-success').addClass('notice-error');
                    $message.html('<p>' + hhrhAdmin.strings.saveFailed + '</p>');
                    $message.slideDown();

                    setTimeout(function() {
                        $message.slideUp();
                    }, 3000);
                },
                complete: function() {
                    $submitBtn.prop('disabled', false);
                }
            });
        },

        /**
         * Get current form settings
         */
        getCurrentSettings: function() {
            return {
                enabled: $('#hhrh_enabled').is(':checked'),
                ha_url: $('#hhrh_ha_url').val(),
                ha_token: $('#hhrh_ha_token').val(),
                refresh_interval: $('#hhrh_refresh_interval').val(),
                show_booking_info: $('#hhrh_show_booking_info').is(':checked'),
                alert_threshold_temp: $('#hhrh_alert_threshold_temp').val()
            };
        }
    };

    // Initialize on DOM ready
    $(document).ready(function() {
        HHRHAdmin.init();
    });

})(jQuery);
