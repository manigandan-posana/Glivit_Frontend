const appJson = require('./app.json');

module.exports = ({ config }) => {
  const googleMapsApiKey =
    process.env.GOOGLE_MAPS_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY || '';

  const expoConfig = {
    ...config,
    ...appJson.expo,
  };

  if (!googleMapsApiKey) {
    return expoConfig;
  }

  return {
    ...expoConfig,
    android: {
      ...expoConfig.android,
      config: {
        ...expoConfig.android?.config,
        googleMaps: {
          ...expoConfig.android?.config?.googleMaps,
          apiKey: googleMapsApiKey,
        },
      },
    },
  };
};
