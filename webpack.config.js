const path = require('path');

module.exports = {
  entry: './src/index.ts',
  devtool: 'inline-source-map',
  module: {
    rules: [
      {
        test: /\.ts?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
	  {
	    test: /\.m?js$/,
	    exclude: /node_modules\/(?!@?opentelemetry)/,
	    use: {
		  loader: 'babel-loader',
		  options: {
		    sourceType: "unambiguous",
		    presets: ['@babel/preset-env'],
			plugins: ["@babel/plugin-transform-runtime"]
		  }
	    }
	  }
    ],
  },
  resolve: {
    extensions: [ '.ts', '.js' ],
  },
  output: {
    filename: 'boomerang-opentelemetry.js',
    path: path.resolve(__dirname, 'dist'),
  },
  mode: 'development'
};  
