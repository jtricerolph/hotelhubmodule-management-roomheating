# Hotel Hub Module - Room Heating

WordPress plugin module for Hotel Hub PWA app that provides real-time room heating monitoring and control through Home Assistant integration.

## Features

- Real-time room heating status monitoring
- Temperature control per TRV (Thermostatic Radiator Valve)
- Guest booking information display
- Category-based room grouping
- Flat and grouped view options
- Responsive mobile-first design
- Material Symbols icons
- WordPress Heartbeat API for live updates

## Requirements

- WordPress 5.0+
- PHP 7.4+
- Hotel Hub App plugin
- Workforce Authentication plugin
- Home Assistant with NewBook heating integration

## Installation

1. Upload the plugin folder to `/wp-content/plugins/`
2. Activate the plugin through the 'Plugins' menu in WordPress
3. Configure Home Assistant settings under Hotel Hub > Settings

## Configuration

### Home Assistant Settings

Per location, configure:
- **HA URL**: Your Home Assistant URL (e.g., `http://homeassistant.local:8123`)
- **Access Token**: Long-lived access token from Home Assistant
- **Refresh Interval**: How often to poll for updates (15-300 seconds)
- **Show Booking Info**: Display guest information in room details
- **Alert Threshold**: Temperature threshold for alerts

## Permissions

- **heating_view**: View room heating status and temperatures
- **heating_control**: Adjust room temperatures via thermostats

## Usage

The module integrates with Hotel Hub's existing room/site configuration. Room lists are automatically synced with your NewBook integration settings.

### View Options

- **Grouped View**: Rooms organized by category (configured in Hotel Hub)
- **Flat View**: All rooms in a single sorted list

### Temperature Control

Users with `heating_control` permission can adjust individual TRV temperatures. Changes are temporary and will be overridden by the next scheduled automation update from Home Assistant.

## Development

This plugin follows the Hotel Hub module architecture. See [HOTEL_HUB_MODULE_CHECKLIST.md](https://github.com/yourusername/hotel-hub-docs) for development guidelines.

## License

Proprietary - All rights reserved

## Author

Hotel Hub Development Team
