const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
	module: {
		rules: [
			{
				test: /\.ts$/,
				use: 'ts-loader'
			}
		]
	},
	entry: './src/index.ts',
	output: {
		path: path.resolve(__dirname, 'dist'),
		filename: 'out.js'
	},
	resolve: {
		extensions: ['.ts', '.js']
	},
	devServer: {
		port: 17933,
		contentBase: './res'
	},
	mode: 'development',
	plugins: [
		new CopyPlugin({
			patterns: [
				{from: 'res', to: '.'}
			]
		})
	]
};