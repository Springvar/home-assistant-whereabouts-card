# Home Assistant Whereabouts Card

Custom Lovelace card for Home Assistant to display whereabouts (location, presence, zone) for persons/devices.

<!-- Placeholder for preview image -->
<!-- <img src="https://raw.githubusercontent.com/Springvar/home-assistant-whereabouts-card/main/card.png" width="35%"> -->

## Table of Contents
1. [Introduction](#introduction)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [Usage](#usage)
5. [Support](#support)

## Introduction
The Whereabouts Card is designed to visually display presence, location, or zone data for people or devices in your Home Assistant dashboard.  
You will be able to monitor where family members or tracked entities are currently located, with customizable options.

**Note:** This repository is under initial development. More features and details will be added soon.

## Installation

### Prerequisites
This card is intended for use with Home Assistant, utilizing its built-in person, device_tracker, or zone entities.

### HACS (recommended)
Have [HACS](https://hacs.xyz/) installed to manage and update custom cards easily.

[![Install quickly via a HACS link](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=Springvar&repository=home-assistant-whereabouts-card&category=plugin)

1. Go to **HACS** -> **Frontend**.
2. Add this repository ([https://github.com/Springvar/home-assistant-whereabouts-card](https://github.com/Springvar/home-assistant-whereabouts-card)) as a [custom repository](https://hacs.xyz/docs/faq/custom_repositories/).
3. Download and restart Home Assistant.

### Manual

1. **Download the Card**:
   - Download or clone this repository.

2. **Add to Home Assistant**:
   - Place the files in a `www/whereabouts-card` directory inside your Home Assistant configuration folder.

3. **Reference the Card in Lovelace Resources**:
   ```yaml
   resources:
     - url: /local/whereabouts-card/whereabouts-card.js
       type: module
   ```

## Configuration

To use the card, simply add configuration like:

```yaml
type: custom:whereabouts-card
```

Configuration options and advanced usage will be documented once a stable version is released.

## Usage

Check back soon for feature list, example configurations, and screenshots.

## Support

For support, you can:
- Open an issue in the GitHub repository.
- Join the Home Assistant community forums for further help.
- Watch for documentation updates as development progresses.

Your suggestions and feedback are welcome!