# Images Directory

This directory is intended for static assets used in the SeedCore Hotel Simulator.

## Supported Formats
- SVG (Recommended for UI/Logos)
- PNG/JPG (Textures and Backgrounds)

## Importing Images
To use images in your React components, import them relative to the component file:

```typescript
import logo from '../images/logo.svg';

export const MyComponent = () => (
  <img src={logo} alt="SeedCore Logo" />
);
```
