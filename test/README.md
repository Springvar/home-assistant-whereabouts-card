# Test Page

## Usage

1. Build the card:
   ```bash
   yarn build
   ```

2. Start the dev server:
   ```bash
   yarn dev
   ```
   This will automatically open the test page in your browser at `http://localhost:5173/test/card.html`

## Configuration

The test page loads configuration from YAML files:

- **Default**: `config.yaml` - Basic configuration with sample persons and zones
- **Custom**: Create additional YAML files and load them with `?config=filename` (without .yaml extension)

Example: `http://localhost:5173/test/card.html?config=myconfig` loads `myconfig.yaml`

## Dummy Data

The test page includes mock Home Assistant data:
- Person entities (Jane, John, Alice)
- Zone entities (office, laboratory, home)
- Home Assistant theming variables

You can modify the dummy data directly in `card.html` for testing different scenarios.
