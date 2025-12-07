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

            // Load system status if configured
            if ($('#hhrh-system-status-content').length > 0) {
                HHRHAdmin.loadSystemStatus();
            }
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

                    // Reload system status if settings saved successfully
                    if (response.success && $('#hhrh-system-status-content').length > 0) {
                        setTimeout(function() {
                            HHRHAdmin.loadSystemStatus();
                        }, 500);
                    }
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
         * Load system status
         */
        loadSystemStatus: function() {
            const hotelId = $('input[name="hotel_id"]').val();

            $('#hhrh-system-status-content').html('<p><em>Loading system status...</em></p>');

            // This would call an AJAX endpoint to get HA system status
            // For now, we'll show a placeholder
            setTimeout(function() {
                const html = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:15px;">' +
                    '<div style="padding:15px;background:#fff;border-radius:6px;border:1px solid #ddd;">' +
                    '<div style="font-size:12px;color:#666;margin-bottom:5px;">Connection</div>' +
                    '<div style="font-size:20px;font-weight:600;color:#16a34a;">Connected</div>' +
                    '</div>' +
                    '<div style="padding:15px;background:#fff;border-radius:6px;border:1px solid #ddd;">' +
                    '<div style="font-size:12px;color:#666;margin-bottom:5px;">Last Update</div>' +
                    '<div style="font-size:14px;font-weight:500;">Just now</div>' +
                    '</div>' +
                    '</div>';

                $('#hhrh-system-status-content').html(html);
            }, 500);
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
