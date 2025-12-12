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
         * Get battery SVG icon
         */
        getBatterySVG: function(status) {
            const svgs = {
                'critical': '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px"><path d="M160-240q-50 0-85-35t-35-85v-240q0-50 35-85t85-35h540q50 0 85 35t35 85v240q0 50-35 85t-85 35H160Zm0-80h540q17 0 28.5-11.5T740-360v-240q0-17-11.5-28.5T700-640H160q-17 0-28.5 11.5T120-600v240q0 17 11.5 28.5T160-320Zm700-60v-200h20q17 0 28.5 11.5T920-540v120q0 17-11.5 28.5T880-380h-20Zm-700 20v-240h80v240h-80Z"/></svg>',
                'warning': '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px"><path d="M160-240q-50 0-85-35t-35-85v-240q0-50 35-85t85-35h540q50 0 85 35t35 85v240q0 50-35 85t-85 35H160Zm0-80h540q17 0 28.5-11.5T740-360v-240q0-17-11.5-28.5T700-640H160q-17 0-28.5 11.5T120-600v240q0 17 11.5 28.5T160-320Zm700-60v-200h20q17 0 28.5 11.5T920-540v120q0 17-11.5 28.5T880-380h-20Zm-700 20v-240h240v240H160Z"/></svg>',
                'ok': '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px"><path d="M160-240q-50 0-85-35t-35-85v-240q0-50 35-85t85-35h540q50 0 85 35t35 85v240q0 50-35 85t-85 35H160Zm0-80h540q17 0 28.5-11.5T740-360v-240q0-17-11.5-28.5T700-640H160q-17 0-28.5 11.5T120-600v240q0 17 11.5 28.5T160-320Zm700-60v-200h20q17 0 28.5 11.5T920-540v120q0 17-11.5 28.5T880-380h-20Zm-700 20v-240h480v240H160Z"/></svg>'
            };
            return svgs[status] || svgs['ok'];
        },

        /**
         * Update last update timestamp text
         */
        updateLastUpdateText: function() {
            if (HHRH.lastUpdate === 0) {
                return;
            }

            const now = Math.floor(Date.now() / 1000);
            const elapsed = now - HHRH.lastUpdate;

            let text = '';
            if (elapsed < 5) {
                text = 'Just now';
            } else if (elapsed < 60) {
                text = elapsed + 's ago';
            } else if (elapsed < 3600) {
                const minutes = Math.floor(elapsed / 60);
                text = minutes + 'm ago';
            } else {
                const hours = Math.floor(elapsed / 3600);
                text = hours + 'h ago';
            }

            $('#hhrh-last-update-text').text(text);
        },

        /**
         * Set syncing status
         */
        setSyncStatus: function(syncing) {
            const $indicator = $('#hhrh-connection-indicator');
            const $updateText = $('#hhrh-last-update-text');

            if (syncing) {
                $indicator.addClass('hhrh-syncing');
                $updateText.text('Syncing...');
            } else {
                $indicator.removeClass('hhrh-syncing');
                HHRH.updateLastUpdateText();
            }
        },

        /**
         * Sort TRVs by location: Bedroom > Lounge > Others (alphabetically) > Bathroom
         */
        sortTrvsByLocation: function(trvs) {
            return [...trvs].sort((a, b) => {
                const getSortPriority = (location) => {
                    const loc = location.toLowerCase();
                    if (loc.startsWith('bedroom')) return 0;
                    if (loc === 'lounge') return 1;
                    if (loc === 'bathroom') return 999;
                    return 2;
                };

                const priorityA = getSortPriority(a.location);
                const priorityB = getSortPriority(b.location);

                if (priorityA !== priorityB) {
                    return priorityA - priorityB;
                }

                return a.location.localeCompare(b.location);
            });
        },

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

            // Update timestamp every 5 seconds
            setInterval(function() {
                HHRH.updateLastUpdateText();
            }, 5000);
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

            // Temperature control - single valve
            $(document).on('click', '.hhrh-btn-apply:not(.hhrh-btn-apply-all)', function() {
                const entityId = $(this).data('entity-id');
                const $input = $(this).closest('.hhrh-trv-control').find('.hhrh-temp-input');
                const temperature = parseFloat($input.val());
                HHRH.setTemperature(entityId, temperature, $input);
            });

            // Temperature control - all valves
            $(document).on('click', '.hhrh-btn-apply-all', function() {
                const $input = $('#hhrh-set-all-temp');
                const temperature = parseFloat($input.val());
                // jQuery .data() auto-parses JSON and converts hyphenated names to camelCase
                const entityIds = $input.data('entityIds');
                if (entityIds && entityIds.length > 0) {
                    HHRH.setAllTemperatures(entityIds, temperature, $input);
                } else {
                    console.error('[HHRH] No entity IDs found for Set All');
                }
            });

            // Temperature decrease button
            $(document).on('click', '.hhrh-temp-decrease', function() {
                const $input = $(this).closest('.hhrh-temp-control').find('.hhrh-temp-input');
                const currentValue = parseFloat($input.val());
                const newValue = Math.max(5, currentValue - 0.5);
                $input.val(newValue.toFixed(1)).trigger('change');
            });

            // Temperature increase button
            $(document).on('click', '.hhrh-temp-increase', function() {
                const $input = $(this).closest('.hhrh-temp-control').find('.hhrh-temp-input');
                const currentValue = parseFloat($input.val());
                const newValue = Math.min(30, currentValue + 0.5);
                $input.val(newValue.toFixed(1)).trigger('change');
            });

            // Temperature input - highlight when changed
            $(document).on('input change', '.hhrh-temp-input', function() {
                const $input = $(this);
                const currentValue = parseFloat($input.val());
                const originalValue = parseFloat($input.data('original-value'));

                if (currentValue !== originalValue) {
                    $input.addClass('hhrh-temp-modified');
                } else {
                    $input.removeClass('hhrh-temp-modified');
                }
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
            HHRH.setSyncStatus(true);

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
                    HHRH.setSyncStatus(false);
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

                // Sort TRVs: Bedroom(s) first, then Lounge, then others alphabetically, Bathroom last
                const sortedTrvs = HHRH.sortTrvsByLocation(room.trvs);

                sortedTrvs.forEach(trv => {
                    const $trvItem = $('<div>', { class: 'hhrh-trv-item' });

                    // Radiator icon based on valve position
                    if (trv.valve_position !== null && trv.valve_position !== undefined) {
                        const valvePosition = parseInt(trv.valve_position, 10);
                        if (!isNaN(valvePosition)) {
                            let iconClass = 'mdi ';
                            let iconColorClass = '';

                            if (valvePosition > 0) {
                                iconClass += 'mdi-radiator';
                                iconColorClass = 'hhrh-radiator-active';
                            } else {
                                iconClass += 'mdi-radiator-disabled';
                                iconColorClass = 'hhrh-radiator-idle';
                            }

                            $trvItem.append($('<i>', {
                                class: iconClass + ' ' + iconColorClass,
                                title: 'Valve: ' + valvePosition + '%'
                            }));
                        }
                    }

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

            // Room state with timing information
            if (room.room_state) {
                let statusText = '';
                let statusClass = 'hhrh-room-state';

                // Determine status and timing info
                if (room.room_state === 'vacant') {
                    statusClass += ' hhrh-room-state-vacant';
                    if (room.heating_start) {
                        const heatingDate = new Date(room.heating_start);
                        statusText = 'Vacant - till ' + heatingDate.toLocaleString();
                    } else {
                        statusText = 'Vacant';
                    }
                } else if (room.room_state === 'booked') {
                    statusClass += ' hhrh-room-state-booked';
                    if (room.arrival) {
                        const arrivalDate = new Date(room.arrival);
                        statusText = 'Booked - arriving ' + arrivalDate.toLocaleString();
                    } else {
                        statusText = 'Booked';
                    }
                } else if (room.room_state === 'heating_up') {
                    statusClass += ' hhrh-room-state-heating-up';
                    if (room.arrival) {
                        const arrivalDate = new Date(room.arrival);
                        statusText = 'Heating Up - arriving ' + arrivalDate.toLocaleString();
                    } else {
                        statusText = 'Heating Up';
                    }
                } else if (room.room_state === 'occupied') {
                    statusClass += ' hhrh-room-state-occupied';
                    if (room.departure) {
                        const departDate = new Date(room.departure);
                        statusText = 'Occupied - till ' + departDate.toLocaleString();
                    } else {
                        statusText = 'Occupied';
                    }
                } else if (room.room_state === 'cooling_down') {
                    statusClass += ' hhrh-room-state-cooling-down';
                    statusText = 'Cooling Down';
                } else {
                    statusText = room.room_state.replace(/_/g, ' ');
                }

                $footer.append($('<div>', {
                    class: statusClass,
                    text: statusText
                }));
            }

            // Battery indicator badge
            if (room.battery_status) {
                const $batteryBadge = $('<div>', {
                    class: 'hhrh-battery-badge hhrh-battery-' + room.battery_status
                });

                // Add SVG icon
                const batterySvg = HHRH.getBatterySVG(room.battery_status);
                $batteryBadge.append($(batterySvg));

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

            // Find room name from cached data
            const room = HHRH.rooms ? HHRH.rooms.find(r => r.room_id === roomId) : null;
            const roomName = room ? room.room_name : roomId;

            $('#hhrh-modal-title').text(roomName);
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
            // Update modal title with room name
            $('#hhrh-modal-title').text(data.room_name || '');

            // Remove any existing status info
            $('.hhrh-room-status-info').remove();

            // Room status with timing (insert after title)
            if (data.room_state) {
                const $statusInfo = $('<div>', { class: 'hhrh-room-status-info' });

                let statusLabel = '';
                let timingInfo = '';
                let statusClass = '';

                // Determine status and timing info
                if (data.room_state === 'vacant') {
                    statusClass = 'hhrh-status-vacant';
                    statusLabel = 'Vacant';
                    if (data.heating_start) {
                        const heatingDate = new Date(data.heating_start);
                        timingInfo = 'till ' + heatingDate.toLocaleString();
                    }
                } else if (data.room_state === 'booked') {
                    statusClass = 'hhrh-status-booked';
                    statusLabel = 'Booked';
                    if (data.arrival) {
                        const arrivalDate = new Date(data.arrival);
                        timingInfo = 'arriving ' + arrivalDate.toLocaleString();
                    }
                } else if (data.room_state === 'heating_up') {
                    statusClass = 'hhrh-status-heating-up';
                    statusLabel = 'Heating Up';
                    if (data.arrival) {
                        const arrivalDate = new Date(data.arrival);
                        timingInfo = 'arriving ' + arrivalDate.toLocaleString();
                    }
                } else if (data.room_state === 'occupied') {
                    statusClass = 'hhrh-status-occupied';
                    statusLabel = 'Occupied';
                    if (data.departure) {
                        const departDate = new Date(data.departure);
                        timingInfo = 'till ' + departDate.toLocaleString();
                    }
                } else if (data.room_state === 'cooling_down') {
                    statusClass = 'hhrh-status-cooling-down';
                    statusLabel = 'Cooling Down';
                } else {
                    statusLabel = data.room_state.replace(/_/g, ' ');
                }

                $statusInfo.addClass(statusClass);

                // Add status label
                const $statusLabel = $('<div>', {
                    class: 'hhrh-status-label',
                    text: statusLabel
                });
                $statusInfo.append($statusLabel);

                // Add timing info if available
                if (timingInfo) {
                    const $timingInfo = $('<div>', {
                        class: 'hhrh-status-timing',
                        text: timingInfo
                    });
                    $statusInfo.append($timingInfo);
                }

                // Insert after the title
                $('#hhrh-modal-title').after($statusInfo);
            }

            const $body = $('<div>');

            // TRV Controls
            if (data.trvs && data.trvs.length > 0) {
                const $trvControls = $('<div>', { class: 'hhrh-trv-controls' });

                // Set All Valves control (only if user has permission and more than 1 TRV)
                if (data.can_control && data.trvs.length > 1) {
                    const $setAllControl = $('<div>', { class: 'hhrh-set-all-control' });

                    const $setAllLabel = $('<div>', { class: 'hhrh-set-all-label' });
                    $setAllLabel.append($('<span>', {
                        class: 'material-symbols-outlined',
                        text: 'thermostat'
                    }));
                    $setAllLabel.append($('<span>', { text: 'Set All Valves' }));
                    $setAllControl.append($setAllLabel);

                    const $tempControl = $('<div>', { class: 'hhrh-temp-control' });

                    // Get average target temp for default value
                    const avgTarget = Math.round(data.trvs.reduce((sum, t) => sum + (t.target_temp || 20), 0) / data.trvs.length * 2) / 2;

                    // Store entity IDs for the set all function
                    const entityIds = data.trvs.map(t => t.entity_id);

                    // Decrease button
                    $tempControl.append($('<button>', {
                        class: 'hhrh-temp-btn hhrh-temp-decrease',
                        type: 'button',
                        'data-target': 'set-all',
                        text: '−'
                    }));

                    // Temperature input
                    const $setAllInput = $('<input>', {
                        type: 'number',
                        class: 'hhrh-temp-input',
                        id: 'hhrh-set-all-temp',
                        min: 5,
                        max: 30,
                        step: 0.5,
                        value: avgTarget
                    });
                    // Use jQuery .data() to store complex data (not as HTML attribute)
                    $setAllInput.data('original-value', avgTarget);
                    $setAllInput.data('entityIds', entityIds);
                    $tempControl.append($setAllInput);

                    // Increase button
                    $tempControl.append($('<button>', {
                        class: 'hhrh-temp-btn hhrh-temp-increase',
                        type: 'button',
                        'data-target': 'set-all',
                        text: '+'
                    }));

                    // Apply button
                    $tempControl.append($('<button>', {
                        class: 'hhrh-btn-apply hhrh-btn-apply-all',
                        id: 'hhrh-set-all-apply',
                        text: 'Apply All'
                    }));

                    $setAllControl.append($tempControl);
                    $trvControls.append($setAllControl);
                }

                // Sort TRVs: Bedroom(s) first, then Lounge, then others alphabetically, Bathroom last
                const sortedTrvs = HHRH.sortTrvsByLocation(data.trvs);

                sortedTrvs.forEach(trv => {
                    console.log('[HHRH] TRV Data:', {
                        location: trv.location,
                        wifi_signal: trv.wifi_signal,
                        valve_position: trv.valve_position,
                        battery: trv.battery
                    });

                    // Add heating class if valve is open
                    let controlClass = 'hhrh-trv-control';
                    if (trv.valve_position && trv.valve_position > 0) {
                        controlClass += ' hhrh-trv-heating';
                    }
                    const $control = $('<div>', { class: controlClass });

                    // Header
                    const $header = $('<div>', { class: 'hhrh-trv-control-header' });

                    const $title = $('<div>', { class: 'hhrh-trv-location-title' });

                    // Add radiator icon based on valve position
                    if (trv.valve_position !== null && trv.valve_position !== undefined) {
                        const valvePosition = parseInt(trv.valve_position, 10);
                        if (!isNaN(valvePosition)) {
                            let iconClass = 'mdi ';
                            let iconColorClass = '';

                            if (valvePosition > 0) {
                                iconClass += 'mdi-radiator';
                                iconColorClass = 'hhrh-radiator-active';
                            } else {
                                iconClass += 'mdi-radiator-disabled';
                                iconColorClass = 'hhrh-radiator-idle';
                            }

                            $title.append($('<i>', {
                                class: iconClass + ' ' + iconColorClass
                            }));
                        }
                    }

                    $title.append(trv.location);

                    $header.append($title);

                    // Indicators container (WiFi, Valve, Battery)
                    const $indicators = $('<div>', { class: 'hhrh-trv-indicators' });

                    // WiFi signal indicator
                    if (trv.wifi_signal !== null && trv.wifi_signal !== undefined && trv.wifi_signal !== '') {
                        const wifiSignal = parseInt(trv.wifi_signal, 10);

                        if (!isNaN(wifiSignal)) {
                            let wifiStatus = 'good';
                            if (wifiSignal < -80) {
                                wifiStatus = 'poor';
                            } else if (wifiSignal < -70) {
                                wifiStatus = 'fair';
                            }

                            const $wifi = $('<div>', {
                                class: 'hhrh-trv-wifi hhrh-wifi-' + wifiStatus,
                                title: 'WiFi Signal: ' + wifiSignal + ' dBm'
                            });

                            $wifi.append($('<span>', {
                                class: 'material-symbols-outlined',
                                text: 'wifi'
                            }));

                            $wifi.append($('<span>', {
                                class: 'hhrh-wifi-value',
                                text: wifiSignal
                            }));

                            $indicators.append($wifi);
                        }
                    }

                    // Valve position indicator
                    if (trv.valve_position !== null && trv.valve_position !== undefined) {
                        const valvePosition = parseInt(trv.valve_position, 10);

                        if (!isNaN(valvePosition)) {
                            // Determine valve class based on position
                            let valveClass = 'hhrh-trv-valve';
                            if (valvePosition === 0) {
                                valveClass += ' hhrh-valve-closed';
                            } else {
                                valveClass += ' hhrh-valve-open';
                            }

                            const $valve = $('<div>', {
                                class: valveClass,
                                title: 'Valve Position: ' + valvePosition + '%'
                            });

                            $valve.append($('<span>', {
                                class: 'material-symbols-outlined',
                                text: 'valve'
                            }));

                            $valve.append($('<span>', {
                                class: 'hhrh-valve-value',
                                text: valvePosition + '%'
                            }));

                            $indicators.append($valve);
                        }
                    }

                    // Battery indicator
                    if (trv.battery !== null && trv.battery !== undefined && trv.battery !== '') {
                        const batteryLevel = parseInt(trv.battery, 10);

                        // Only show if we have a valid battery level
                        if (!isNaN(batteryLevel)) {
                            let batteryStatus = 'ok';
                            let batteryClass = 'hhrh-trv-battery';

                            // Determine battery status based on level
                            if (batteryLevel <= 15) {
                                batteryStatus = 'critical';
                                batteryClass += ' hhrh-battery-critical';
                            } else if (batteryLevel <= 30) {
                                batteryStatus = 'warning';
                                batteryClass += ' hhrh-battery-warning';
                            } else {
                                batteryClass += ' hhrh-battery-ok';
                            }

                            const $battery = $('<div>', { class: batteryClass });

                            // Add SVG icon
                            const batterySvg = HHRH.getBatterySVG(batteryStatus);
                            $battery.append($(batterySvg));

                            $battery.append($('<span>', {
                                text: batteryLevel + '%'
                            }));
                            $indicators.append($battery);
                        }
                    }

                    // Append indicators to header
                    if ($indicators.children().length > 0) {
                        $header.append($indicators);
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

                    // Check if there's a pending target temperature
                    const $targetValue = $('<div>', { class: 'hhrh-temp-display-value' });
                    if (trv.has_pending_target && trv.command_target_temp !== null) {
                        // Show greyed out actual temp with pending command temp
                        $targetValue.html(
                            '<span class="hhrh-target-actual">' + (trv.target_temp || '--') + '°</span>' +
                            '<span class="hhrh-target-pending">' + trv.command_target_temp.toFixed(1) + '°</span>'
                        );
                    } else {
                        $targetValue.text((trv.target_temp || '--') + '°');
                    }
                    $target.append($targetValue);

                    $temps.append($current).append($target);
                    $control.append($temps);

                    // Temperature control (if user has permission)
                    if (data.can_control) {
                        const $tempControl = $('<div>', { class: 'hhrh-temp-control' });

                        // Use command target if pending, otherwise use actual target
                        const currentTemp = trv.has_pending_target && trv.command_target_temp !== null
                            ? trv.command_target_temp
                            : (trv.target_temp || 20);

                        // Check if valve calibration failed (-1% indicates calibration issue)
                        const valveCalibrationFailed = trv.valve_position === -1;

                        // Decrease button
                        $tempControl.append($('<button>', {
                            class: 'hhrh-temp-btn hhrh-temp-decrease',
                            type: 'button',
                            'data-entity-id': trv.entity_id,
                            text: '−',
                            disabled: valveCalibrationFailed
                        }));

                        // Temperature input
                        $tempControl.append($('<input>', {
                            type: 'number',
                            class: 'hhrh-temp-input',
                            min: 5,
                            max: 30,
                            step: 0.5,
                            value: currentTemp,
                            'data-original-value': currentTemp,
                            disabled: valveCalibrationFailed
                        }));

                        // Increase button
                        $tempControl.append($('<button>', {
                            class: 'hhrh-temp-btn hhrh-temp-increase',
                            type: 'button',
                            'data-entity-id': trv.entity_id,
                            text: '+',
                            disabled: valveCalibrationFailed
                        }));

                        // Apply button
                        $tempControl.append($('<button>', {
                            class: 'hhrh-btn-apply',
                            'data-entity-id': trv.entity_id,
                            text: 'Apply',
                            disabled: valveCalibrationFailed
                        }));

                        $control.append($tempControl);

                        // Show calibration error message if valve failed
                        if (valveCalibrationFailed) {
                            const $calibrationError = $('<div>', {
                                class: 'hhrh-calibration-error'
                            });

                            $calibrationError.append($('<span>', {
                                class: 'material-symbols-outlined',
                                text: 'error'
                            }));

                            $calibrationError.append($('<span>', {
                                text: 'Valve calibration failed, target adjustment not possible'
                            }));

                            $control.append($calibrationError);
                        }
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
        setTemperature: function(entityId, temperature, $input) {
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
                        // Verify the temperature was set by polling HA state
                        HHRH.verifyTemperatureChange(entityId, temperature, $button, $input, 0);
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
         * Set temperature for all valves in room
         */
        setAllTemperatures: function(entityIds, temperature, $input) {
            console.log('[HHRH] setAllTemperatures called:', { entityIds, temperature });

            const $button = $('.hhrh-btn-apply-all');
            $button.prop('disabled', true).addClass('hhrh-btn-loading');

            let completed = 0;
            let failed = 0;
            const total = entityIds.length;

            // Send request for each entity
            entityIds.forEach(entityId => {
                console.log('[HHRH] Sending temperature request for:', entityId, 'temp:', temperature);
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
                        console.log('[HHRH] Response for', entityId, ':', response);
                        if (!response.success) {
                            failed++;
                        }
                    },
                    error: function(xhr, status, error) {
                        console.error('[HHRH] Error for', entityId, ':', status, error);
                        failed++;
                    },
                    complete: function() {
                        completed++;

                        // All requests completed
                        if (completed === total) {
                            $button.prop('disabled', false).removeClass('hhrh-btn-loading');

                            if (failed === 0) {
                                // Update all individual inputs to match
                                $('.hhrh-trv-control .hhrh-temp-input').each(function() {
                                    $(this).val(temperature.toFixed(1));
                                    $(this).data('original-value', temperature);
                                    $(this).removeClass('hhrh-temp-modified');
                                });

                                // Update set all input
                                $input.data('original-value', temperature);
                                $input.removeClass('hhrh-temp-modified');

                                HHRH.showNotification(
                                    'success',
                                    'All Temperatures Updated',
                                    'All ' + total + ' valves set to ' + temperature.toFixed(1) + '°C'
                                );

                                // Refresh main room list
                                HHRH.loadRooms();
                            } else if (failed < total) {
                                HHRH.showNotification(
                                    'warning',
                                    'Partial Update',
                                    (total - failed) + ' of ' + total + ' valves updated. ' + failed + ' failed.'
                                );
                                HHRH.loadRooms();
                            } else {
                                HHRH.showNotification(
                                    'error',
                                    'Update Failed',
                                    'Failed to update all valves. Please try again.'
                                );
                            }
                        }
                    }
                });
            });
        },

        /**
         * Verify temperature change was successful with polling
         * Polls up to 5 times (5 seconds total) waiting for climate to confirm
         * If climate doesn't confirm but command sensor does, shows pending message
         */
        verifyTemperatureChange: function(entityId, expectedTemp, $button, $input, attempt) {
            const maxAttempts = 5;
            const pollInterval = 1000; // 1 second between polls

            setTimeout(function() {
                $.ajax({
                    url: hhrhData.ajaxUrl,
                    type: 'POST',
                    data: {
                        action: 'hhrh_verify_temperature',
                        nonce: hhrhData.nonce,
                        entity_id: entityId,
                        expected_temp: expectedTemp,
                        location_id: hhrhData.locationId
                    },
                    success: function(response) {
                        if (response.success) {
                            const data = response.data;

                            // Check if climate has confirmed the change
                            if (data.climate_confirmed) {
                                // Success - climate entity has the new temperature
                                $button.prop('disabled', false).removeClass('hhrh-btn-loading');

                                const $control = $button.closest('.hhrh-trv-control');
                                HHRH.updateTrvTargetDisplay($control, data.climate_target, null, false);

                                $input.val(data.climate_target.toFixed(1));
                                $input.data('original-value', data.climate_target);
                                $input.removeClass('hhrh-temp-modified');

                                HHRH.showNotification(
                                    'success',
                                    'Temperature Updated',
                                    'Target temperature set to ' + data.climate_target.toFixed(1) + '°C'
                                );

                                HHRH.loadRooms();
                            } else if (attempt < maxAttempts - 1) {
                                // Not confirmed yet, retry
                                HHRH.verifyTemperatureChange(entityId, expectedTemp, $button, $input, attempt + 1);
                            } else {
                                // Max attempts reached - check if command sensor confirmed
                                $button.prop('disabled', false).removeClass('hhrh-btn-loading');

                                if (data.command_confirmed) {
                                    // Command was received but valve is sleeping
                                    const $control = $button.closest('.hhrh-trv-control');
                                    HHRH.updateTrvTargetDisplay($control, data.climate_target, data.command_target, true);

                                    $input.val(data.command_target.toFixed(1));
                                    $input.data('original-value', data.command_target);
                                    $input.removeClass('hhrh-temp-modified');

                                    HHRH.showNotification(
                                        'info',
                                        'Temperature Pending',
                                        'Target ' + data.command_target.toFixed(1) + '°C has been submitted but valve may be sleeping. The new temperature should apply when valve wakes.'
                                    );

                                    HHRH.loadRooms();
                                } else {
                                    // Neither confirmed - something went wrong
                                    HHRH.showNotification(
                                        'warning',
                                        'Verification Failed',
                                        'Temperature update sent, but verification failed. Please check the device.'
                                    );
                                }
                            }
                        } else {
                            // Error response
                            if (attempt < maxAttempts - 1) {
                                HHRH.verifyTemperatureChange(entityId, expectedTemp, $button, $input, attempt + 1);
                            } else {
                                $button.prop('disabled', false).removeClass('hhrh-btn-loading');
                                HHRH.showNotification(
                                    'warning',
                                    'Verification Failed',
                                    'Temperature may have been updated, but verification failed. Please check the device.'
                                );
                            }
                        }
                    },
                    error: function() {
                        if (attempt < maxAttempts - 1) {
                            HHRH.verifyTemperatureChange(entityId, expectedTemp, $button, $input, attempt + 1);
                        } else {
                            $button.prop('disabled', false).removeClass('hhrh-btn-loading');
                            HHRH.showNotification(
                                'warning',
                                'Verification Failed',
                                'Temperature update sent, but verification failed. Please check the device.'
                            );
                        }
                    }
                });
            }, pollInterval);
        },

        /**
         * Update TRV target temperature display in modal
         */
        updateTrvTargetDisplay: function($control, climateTarget, commandTarget, hasPending) {
            const $targetDisplay = $control.find('.hhrh-temp-display-value').last();

            if (hasPending && commandTarget !== null) {
                // Show greyed out climate target with pending command target
                $targetDisplay.html(
                    '<span class="hhrh-target-actual">' + climateTarget.toFixed(1) + '°C</span>' +
                    '<span class="hhrh-target-pending">' + commandTarget.toFixed(1) + '°C</span>'
                );
            } else {
                // Show normal target
                $targetDisplay.text(climateTarget.toFixed(1) + '°C');
            }
        },

        /**
         * Show notification modal
         */
        showNotification: function(type, title, message) {
            const iconMap = {
                'success': 'check_circle',
                'error': 'error',
                'warning': 'warning',
                'info': 'info'
            };

            $('#hhrh-notification-icon').removeClass('success error warning info').addClass(type);
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
            // Update nonce if provided (keeps session alive)
            if (data.nonce) {
                hhrhData.nonce = data.nonce;
            }

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
            HHRH.updateLastUpdateText();
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
