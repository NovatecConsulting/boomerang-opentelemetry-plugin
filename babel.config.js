module.exports = function (api) {
  api.cache(true);
  const presets = [
    [
      '@babel/preset-env',
      {
        corejs: {
          version: '3',
          proposals: false,
        },
        useBuiltIns: 'usage',
        targets: {
          browsers: [
            'ie >= 11',
          ],
        },
      },
    ],
  ];
  const plugins = [
    ['@babel/plugin-transform-runtime'],
  ];
  return {
    presets,
    plugins,
  };
};
