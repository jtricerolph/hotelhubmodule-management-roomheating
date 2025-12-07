/**
 * Room Heating Module - Frontend JavaScript
 */

(function($) {
    'use strict';

    // Module state
    const HHRH = {
        rooms: [],
        currentView: 'flat',
        currentFilter: 'all',
        lastUpdate: 0,
        isLoading: false,

        /**
         * Initialize the module
         */
        init: function() {
            // Only initialize if the container exists
            if ($('#hhrh-container').length === 0) {
                return;
            }

            this.loadPreferences();
            this.bindEvents();
            this.loadRooms();
            this.initHeartbeat();
        },

        /**
         * Load saved preferences from localStorage
         */
        loadPreferences: function() {
            const savedView = localStorage.getItem('hhrh_view');
            const savedFilter = localStorage.getItem('hhrh_filter');

            if (savedView && (savedView === 'flat' || savedView === 'grouped')) {
                HHRH.currentView = savedView;
                $('.hhrh-view-toggle').removeClass('active');
                $('.hhrh-view-toggle[data-view="' + savedView + '"]').addClass('active');
            }

            if (savedFilter) {
                HHRH.currentFilter = savedFilter;
                $('.hhrh-filter-btn').removeClass('active');
                $('.hhrh-filter-btn[data-filter="' + savedFilter + '"]').addClass('active');
            }
        },

        /**
         * Bind event listeners
         */
        bindEvents: function() {
            // Settings toggle
            $('#hhrh-settings-toggle').on('click', function() {
                $('#hhrh-controls').slideToggle(200);
            });

            // View toggles
            $('.hhrh-view-toggle').on('click', function() {
                const view = $(this).data('view');
                HHRH.setView(view);
            });

            // Filter buttons
            $('.hhrh-filter-btn').on('click', function() {
                const filter = $(this).data('filter');
                HHRH.setFilter(filter);
            });

            // Retry button
            $('#hhrh-retry-btn').on('click', function() {
                HHRH.loadRooms();
            });

            // Room card click
            $(document).on('click', '.hhrh-room-card', function() {
                const roomId = $(this).data('room-id');
                HHRH.openRoomModal(roomId);
            });

            // Modal close - use delegation since modal is in DOM
            $(document).on('click', '#hhrh-modal-close', function(e) {
                e.preventDefault();
                HHRH.closeModal();
            });

            // Close modal when clicking overlay
            $(document).on('click', '#hhrh-modal', function(e) {
                if (e.target === this) {
                    HHRH.closeModal();
                }
            });

            // Temperature control
            $(document).on('click', '.hhrh-btn-apply', function() {
                const entityId = $(this).data('entity-id');
                const temperature = parseFloat($(this).closest('.hhrh-trv-control').find('.hhrh-temp-input').val());
                HHRH.setTemperature(entityId, temperature);
            });

            // Temperature slider
            $(document).on('input', '.hhrh-temp-slider', function() {
                const value = $(this).val();
                $(this).closest('.hhrh-trv-control').find('.hhrh-temp-input').val(value);
            });

            // Temperature input
            $(document).on('input', '.hhrh-temp-input', function() {
                const value = $(this).val();
                $(this).closest('.hhrh-trv-control').find('.hhrh-temp-slider').val(value);
            });

            // Notification close
            $(document).on('click', '#hhrh-notification-close', function() {
                HHRH.hideNotification();
            });

            // Close notification when clicking overlay
            $(document).on('click', '#hhrh-notification', function(e) {
                if (e.target === this) {
                    HHRH.hideNotification();
                }
            });
        },

        /**
         * Load rooms data
         */
        loadRooms: function() {
            console.log('[HHRH] loadRooms called');

            if (HHRH.isLoading) {
                console.log('[HHRH] Already loading, skipping');
                return;
            }

            HHRH.isLoading = true;

            // Show loading state
            $('#hhrh-loading').show();
            $('#hhrh-error').hide();
            $('#hhrh-rooms').hide();

            console.log('[HHRH] Making AJAX request to:', hhrhData.ajaxUrl);
            console.log('[HHRH] Location ID:', hhrhData.locationId);

            $.ajax({
                url: hhrhData.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'hhrh_get_rooms',
                    nonce: hhrhData.nonce,
                    location_id: hhrhData.locationId
                },
                success: function(response) {
                    console.log('[HHRH] AJAX success, response:', response);

                    if (response.success) {
                        console.log('[HHRH] Loaded', response.data.rooms.length, 'rooms');
                        HHRH.rooms = response.data.rooms;
                        HHRH.lastUpdate = response.data.timestamp;
                        HHRH.renderRooms();

                        // Update connection status
                        $('#hhrh-connection-indicator').removeClass('error');
                    } else {
                        console.error('[HHRH] Response error:', response.data);
                        HHRH.showError(response.data.message || hhrhData.strings.error);
                    }
                },
                error: function(xhr, status, error) {
                    console.error('[HHRH] AJAX error:', status, error);
                    console.error('[HHRH] XHR:', xhr);
                    HHRH.showError(hhrhData.strings.connectionError);

                    // Update connection status
                    $('#hhrh-connection-indicator').addClass('error');
                },
                complete: function() {
                    console.log('[HHRH] AJAX complete, setting isLoading = false');
                    HHRH.isLoading = false;
                    $('#hhrh-loading').hide();
                }
            });
        },

        /**
         * Render rooms
         */
        renderRooms: function() {
            const $container = $('#hhrh-rooms');
            $container.empty();

            if (HHRH.rooms.length === 0) {
                $container.html('<p style="text-align:center;padding:40px;">' + hhrhData.strings.noRooms + '</p>');
                $container.show();
                return;
            }

            // Filter rooms
            let filteredRooms = HHRH.rooms;

            if (HHRH.currentFilter !== 'all') {
                filteredRooms = HHRH.rooms.filter(room => room.heating_status === HHRH.currentFilter);
            }

            // Render based on view
            if (HHRH.currentView === 'grouped') {
                HHRH.renderGroupedView(filteredRooms, $container);
            } else {
                HHRH.renderFlatView(filteredRooms, $container);
            }

            $container.show();
        },

        /**
         * Render flat view
         */
        renderFlatView: function(rooms, $container) {
            // Sort by category order, then site order
            rooms.sort((a, b) => {
                if (a.category_order !== b.category_order) {
                    return a.category_order - b.category_order;
                }
                return a.site_order - b.site_order;
            });

            rooms.forEach(room => {
                $container.append(HHRH.renderRoomCard(room));
            });
        },

        /**
         * Render grouped view
         */
        renderGroupedView: function(rooms, $container) {
            // Group by category
            const categories = {};

            rooms.forEach(room => {
                if (!categories[room.category]) {
                    categories[room.category] = {
                        name: room.category,
                        order: room.category_order,
                        rooms: []
                    };
                }
                categories[room.category].rooms.push(room);
            });

            // Sort categories
            const sortedCategories = Object.values(categories).sort((a, b) => a.order - b.order);

            // Render each category
            sortedCategories.forEach(category => {
                const $categoryGroup = $('<div>', {
                    class: 'hhrh-category-group'
                });

                const $header = $('<div>', {
                    class: 'hhrh-category-header'
                });

                $header.append($('<h3>', {
                    class: 'hhrh-category-title',
                    text: category.name
                }));

                $header.append($('<span>', {
                    class: 'hhrh-category-count',
                    text: category.rooms.length
                }));

                $categoryGroup.append($header);

                // Sort rooms within category
                category.rooms.sort((a, b) => a.site_order - b.site_order);

                // Render room cards
                const $roomsGrid = $('<div>', {
                    class: 'hhrh-rooms'
                });

                category.rooms.forEach(room => {
                    $roomsGrid.append(HHRH.renderRoomCard(room));
                });

                $categoryGroup.append($roomsGrid);
                $container.append($categoryGroup);
            });
        },

        /**
         * Render individual room card
         */
        renderRoomCard: function(room) {
            const statusIcon = {
                'heating': 'heat',
                'idle': 'ac_unit',
                'error': 'warning'
            }[room.heating_status] || 'help';

            const statusLabel = {
                'heating': 'Heating',
                'idle': 'Idle',
                'error': 'Error'
            }[room.heating_status] || 'Unknown';

            const $card = $('<div>', {
                class: 'hhrh-room-card',
                'data-room-id': room.room_id,
                'data-category': room.category,
                'data-status': room.heating_status
            });

            // Header
            const $header = $('<div>', { class: 'hhrh-room-card-header' });

            $header.append($('<div>', {
                class: 'hhrh-room-number',
                text: room.room_name
            }));

            // Temperature in header
            if (room.avg_temperature !== null) {
                const $temp = $('<div>', { class: 'hhrh-room-temp' });

                $temp.append($('<span>', {
                    class: 'hhrh-temp-value',
                    text: room.avg_temperature + '°C'
                }));

                $header.append($temp);
            }

            const $status = $('<div>', {
                class: 'hhrh-room-status hhrh-status-' + room.heating_status
            });

            $status.append($('<span>', {
                class: 'material-symbols-outlined',
                text: statusIcon
            }));

            $status.append(statusLabel);

            $header.append($status);
            $card.append($header);

            // Body
            const $body = $('<div>', { class: 'hhrh-room-card-body' });

            // TRVs
            if (room.trvs && room.trvs.length > 0) {
                const $trvs = $('<div>', { class: 'hhrh-room-trvs' });

                room.trvs.forEach(trv => {
                    const $trvItem = $('<div>', { class: 'hhrh-trv-item' });

                    $trvItem.append($('<span>', {
                        class: 'hhrh-trv-location',
                        text: trv.location + ':'
                    }));

                    $trvItem.append($('<span>', {
                        class: 'hhrh-trv-target',
                        text: (trv.target_temp || '--') + '°C'
                    }));

                    $trvs.append($trvItem);
                });

                $body.append($trvs);
            }

            // Footer row for room state and battery
            const $footer = $('<div>', { class: 'hhrh-room-footer' });

            // Room state
            if (room.room_state) {
                $footer.append($('<div>', {
                    class: 'hhrh-room-state',
                    text: room.room_state.replace(/_/g, ' ')
                }));
            }

            // Battery indicator badge
            if (room.battery_status) {
                const $batteryBadge = $('<div>', {
                    class: 'hhrh-battery-badge hhrh-battery-' + room.battery_status
                });

                // Icon mapping: OK = battery_6_bar, Warning = battery_2_bar, Critical = battery_1_bar
                const batteryIcon = room.battery_status === 'critical' ? 'battery_1_bar' :
                                   (room.battery_status === 'warning' ? 'battery_2_bar' : 'battery_6_bar');

                $batteryBadge.append($('<span>', {
                    class: 'material-symbols-outlined',
                    text: batteryIcon
                }));

                if (room.battery_status !== 'ok' && room.min_battery !== null) {
                    $batteryBadge.append($('<span>', {
                        class: 'hhrh-battery-percent',
                        text: room.min_battery + '%'
                    }));
                }

                $footer.append($batteryBadge);
            }

            if ($footer.children().length > 0) {
                $body.append($footer);
            }

            $card.append($body);

            return $card;
        },

        /**
         * Set view mode
         */
        setView: function(view) {
            HHRH.currentView = view;

            $('.hhrh-view-toggle').removeClass('active');
            $('.hhrh-view-toggle[data-view="' + view + '"]').addClass('active');

            // Save preference
            localStorage.setItem('hhrh_view', view);

            HHRH.renderRooms();
        },

        /**
         * Set filter
         */
        setFilter: function(filter) {
            HHRH.currentFilter = filter;

            $('.hhrh-filter-btn').removeClass('active');
            $('.hhrh-filter-btn[data-filter="' + filter + '"]').addClass('active');

            // Save preference
            localStorage.setItem('hhrh_filter', filter);

            HHRH.renderRooms();
        },

        /**
         * Open room details modal
         */
        openRoomModal: function(roomId) {
            $('#hhrh-modal').show();
            $('#hhrh-modal-title').text('Room ' + roomId);
            $('#hhrh-modal-body').html('<div class="hhrh-loading"><span class="material-symbols-outlined hhrh-spinner">progress_activity</span><p>' + hhrhData.strings.loading + '</p></div>');

            $.ajax({
                url: hhrhData.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'hhrh_get_room_details',
                    nonce: hhrhData.nonce,
                    room_id: roomId,
                    location_id: hhrhData.locationId
                },
                success: function(response) {
                    if (response.success) {
                        HHRH.renderRoomDetails(response.data);
                    } else {
                        $('#hhrh-modal-body').html('<p style="text-align:center;color:#dc2626;">' + (response.data.message || hhrhData.strings.error) + '</p>');
                    }
                },
                error: function() {
                    $('#hhrh-modal-body').html('<p style="text-align:center;color:#dc2626;">' + hhrhData.strings.error + '</p>');
                }
            });
        },

        /**
         * Render room details in modal
         */
        renderRoomDetails: function(data) {
            const $body = $('<div>');

            // TRV Controls
            if (data.trvs && data.trvs.length > 0) {
                const $trvControls = $('<div>', { class: 'hhrh-trv-controls' });

                data.trvs.forEach(trv => {
                    const $control = $('<div>', { class: 'hhrh-trv-control' });

                    // Header
                    const $header = $('<div>', { class: 'hhrh-trv-control-header' });

                    const $title = $('<div>', { class: 'hhrh-trv-location-title' });
                    $title.append($('<span>', {
                        class: 'material-symbols-outlined',
                        text: 'thermostat'
                    }));
                    $title.append(trv.location);

                    $header.append($title);

                    // Battery indicator in top right
                    if (trv.battery !== null && trv.battery !== undefined) {
                        const batteryLevel = parseInt(trv.battery);
                        let batteryIcon = 'battery_6_bar';
                        let batteryClass = 'hhrh-trv-battery';

                        // Determine battery icon based on level
                        if (batteryLevel <= 15) {
                            batteryIcon = 'battery_1_bar';
                            batteryClass += ' hhrh-battery-critical';
                        } else if (batteryLevel <= 30) {
                            batteryIcon = 'battery_2_bar';
                            batteryClass += ' hhrh-battery-warning';
                        } else {
                            batteryClass += ' hhrh-battery-ok';
                        }

                        const $battery = $('<div>', { class: batteryClass });
                        $battery.append($('<span>', {
                            class: 'material-symbols-outlined',
                            text: batteryIcon
                        }));
                        $battery.append($('<span>', {
                            text: trv.battery + '%'
                        }));
                        $header.append($battery);
                    }

                    $control.append($header);

                    // Temperatures
                    const $temps = $('<div>', { class: 'hhrh-trv-temps' });

                    // Current temperature
                    const $current = $('<div>', { class: 'hhrh-temp-display' });
                    $current.append($('<div>', {
                        class: 'hhrh-temp-display-label',
                        text: 'Current'
                    }));
                    $current.append($('<div>', {
                        class: 'hhrh-temp-display-value',
                        text: (trv.current_temp || '--') + '°'
                    }));

                    // Target temperature
                    const $target = $('<div>', { class: 'hhrh-temp-display' });
                    $target.append($('<div>', {
                        class: 'hhrh-temp-display-label',
                        text: 'Target'
                    }));
                    $target.append($('<div>', {
                        class: 'hhrh-temp-display-value',
                        text: (trv.target_temp || '--') + '°'
                    }));

                    $temps.append($current).append($target);
                    $control.append($temps);

                    // Temperature control (if user has permission)
                    if (data.can_control) {
                        const $tempControl = $('<div>', { class: 'hhrh-temp-control' });

                        const currentTemp = trv.target_temp || 20;

                        $tempControl.append($('<input>', {
                            type: 'range',
                            class: 'hhrh-temp-slider',
                            min: 5,
                            max: 30,
                            step: 0.5,
                            value: currentTemp
                        }));

                        $tempControl.append($('<input>', {
                            type: 'number',
                            class: 'hhrh-temp-input',
                            min: 5,
                            max: 30,
                            step: 0.5,
                            value: currentTemp
                        }));

                        $tempControl.append($('<button>', {
                            class: 'hhrh-btn-apply',
                            'data-entity-id': trv.entity_id,
                            text: 'Apply'
                        }));

                        $control.append($tempControl);
                    }

                    $trvControls.append($control);
                });

                $body.append($trvControls);
            }

            // Booking info
            if (data.booking) {
                const $booking = $('<div>', {
                    style: 'margin-top:20px;padding:15px;background:#f9fafb;border-radius:8px;'
                });

                $booking.append($('<h3>', {
                    text: 'Booking Information',
                    style: 'margin:0 0 10px;font-size:16px;'
                }));

                if (data.booking.guest_name && data.booking.guest_name !== 'Vacant') {
                    $booking.append($('<p>', {
                        style: 'margin:5px 0;',
                        html: '<strong>Guest:</strong> ' + data.booking.guest_name
                    }));
                }

                if (data.booking.arrival) {
                    $booking.append($('<p>', {
                        style: 'margin:5px 0;',
                        html: '<strong>Arrival:</strong> ' + new Date(data.booking.arrival).toLocaleString()
                    }));
                }

                if (data.booking.departure) {
                    $booking.append($('<p>', {
                        style: 'margin:5px 0;',
                        html: '<strong>Departure:</strong> ' + new Date(data.booking.departure).toLocaleString()
                    }));
                }

                $body.append($booking);
            }

            $('#hhrh-modal-body').html($body);
        },

        /**
         * Close modal
         */
        closeModal: function() {
            $('#hhrh-modal').hide();
        },

        /**
         * Set temperature
         */
        setTemperature: function(entityId, temperature) {
            const $button = $('.hhrh-btn-apply[data-entity-id="' + entityId + '"]');
            $button.prop('disabled', true).addClass('hhrh-btn-loading');

            $.ajax({
                url: hhrhData.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'hhrh_set_temperature',
                    nonce: hhrhData.nonce,
                    entity_id: entityId,
                    temperature: temperature,
                    location_id: hhrhData.locationId
                },
                success: function(response) {
                    if (response.success) {
                        // Verify the temperature was set by checking HA state
                        HHRH.verifyTemperatureChange(entityId, $button);
                    } else {
                        $button.prop('disabled', false).removeClass('hhrh-btn-loading');
                        HHRH.showNotification(
                            'error',
                            'Update Failed',
                            response.data.message || hhrhData.strings.tempUpdateFailed
                        );
                    }
                },
                error: function() {
                    $button.prop('disabled', false).removeClass('hhrh-btn-loading');
                    HHRH.showNotification(
                        'error',
                        'Update Failed',
                        hhrhData.strings.tempUpdateFailed
                    );
                }
            });
        },

        /**
         * Verify temperature change was successful
         */
        verifyTemperatureChange: function(entityId, $button) {
            // Wait a moment for HA to process the change
            setTimeout(function() {
                // Get current state from HA
                $.ajax({
                    url: hhrhData.ajaxUrl,
                    type: 'POST',
                    data: {
                        action: 'hhrh_verify_temperature',
                        nonce: hhrhData.nonce,
                        entity_id: entityId,
                        location_id: hhrhData.locationId
                    },
                    success: function(response) {
                        $button.prop('disabled', false).removeClass('hhrh-btn-loading');

                        if (response.success && response.data.temperature) {
                            const actualTemp = parseFloat(response.data.temperature);

                            // Update the displayed target temperature in the modal
                            const $control = $button.closest('.hhrh-trv-control');
                            $control.find('.hhrh-temp-display-value').last().text(actualTemp.toFixed(1) + '°C');

                            // Show success notification
                            HHRH.showNotification(
                                'success',
                                'Temperature Updated',
                                'Target temperature set to ' + actualTemp.toFixed(1) + '°C'
                            );

                            // Refresh main room list
                            HHRH.loadRooms();
                        } else {
                            HHRH.showNotification(
                                'warning',
                                'Verification Failed',
                                'Temperature may have been updated, but verification failed. Please check the device.'
                            );
                        }
                    },
                    error: function() {
                        $button.prop('disabled', false).removeClass('hhrh-btn-loading');
                        HHRH.showNotification(
                            'warning',
                            'Verification Failed',
                            'Temperature update sent, but verification failed. Please check the device.'
                        );
                    }
                });
            }, 1500); // Wait 1.5 seconds for HA to process
        },

        /**
         * Show notification modal
         */
        showNotification: function(type, title, message) {
            const iconMap = {
                'success': 'check_circle',
                'error': 'error',
                'warning': 'warning'
            };

            $('#hhrh-notification-icon').removeClass('success error warning').addClass(type);
            $('#hhrh-notification-icon .material-symbols-outlined').text(iconMap[type] || 'info');
            $('#hhrh-notification-title').text(title);
            $('#hhrh-notification-message').text(message);
            $('#hhrh-notification').fadeIn(200);

            // Auto-hide after 4 seconds for success, 6 seconds for others
            const timeout = type === 'success' ? 4000 : 6000;
            setTimeout(function() {
                HHRH.hideNotification();
            }, timeout);
        },

        /**
         * Hide notification modal
         */
        hideNotification: function() {
            $('#hhrh-notification').fadeOut(200);
        },

        /**
         * Show error message
         */
        showError: function(message) {
            $('#hhrh-error-message').text(message);
            $('#hhrh-error').show();
        },

        /**
         * Initialize heartbeat
         */
        initHeartbeat: function() {
            $(document).on('heartbeat-send', function(e, data) {
                data.hhrh_heartbeat = {
                    location_id: hhrhData.locationId,
                    last_update: HHRH.lastUpdate
                };
            });

            $(document).on('heartbeat-tick', function(e, data) {
                if (data.hhrh_heartbeat) {
                    HHRH.handleHeartbeatUpdate(data.hhrh_heartbeat);
                }
            });
        },

        /**
         * Handle heartbeat updates
         */
        handleHeartbeatUpdate: function(data) {
            if (!data.updates || data.updates.length === 0) {
                return;
            }

            // Update room data
            data.updates.forEach(update => {
                const room = HHRH.rooms.find(r => r.room_id === update.room_id);

                if (room) {
                    room.heating_status = update.heating_status;
                    room.room_state = update.room_state;
                    room.avg_temperature = update.avg_temperature;

                    if (update.trvs) {
                        update.trvs.forEach(updatedTrv => {
                            const trv = room.trvs.find(t => t.entity_id === updatedTrv.entity_id);

                            if (trv) {
                                trv.current_temp = updatedTrv.current_temp;
                                trv.target_temp = updatedTrv.target_temp;
                            }
                        });
                    }
                }
            });

            // Re-render
            HHRH.renderRooms();

            // Update timestamp
            HHRH.lastUpdate = data.timestamp;
        }
    };

    // Initialization handling for HHA PWA timing
    let initialized = false;

    function checkAndInit() {
        if (initialized) return true;

        if ($('#hhrh-container').length) {
            console.log('[HHRH] Room Heating module content found, initializing...');
            HHRH.init();
            initialized = true;
            return true;
        }
        return false;
    }

    // Try on document ready
    $(document).ready(function() {
        console.log('[HHRH] Document ready, checking for module...');
        checkAndInit();
    });

    // Listen for HHA custom module load event
    $(document).on('hha-module-loaded', function(e, moduleId) {
        if (moduleId === 'room_heating') {
            console.log('[HHRH] Received HHA module-loaded event, resetting initialization');
            initialized = false; // Reset flag to allow re-initialization
            setTimeout(checkAndInit, 100); // Small delay to ensure DOM is ready
        }
    });

    // Also watch for dynamic content changes (for HHA SPA loading)
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.addedNodes.length) {
                if (checkAndInit()) {
                    observer.disconnect(); // Stop observing once initialized
                }
            }
        });
    });

    // Start observing after a short delay to let HHA set up
    setTimeout(function() {
        if (!initialized && document.body) {
            console.log('[HHRH] Starting MutationObserver...');
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    }, 100);

})(jQuery);
