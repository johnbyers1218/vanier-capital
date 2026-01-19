module.exports = {
	presets: [
		[
			'@babel/preset-env',
			{
				targets: { node: '18' },
				// Force CommonJS for Jest so test files using require() work without --experimental-vm-modules
				modules: 'commonjs'
			}
		]
	],
	plugins: [
		// Transform import.meta for Jest CJS environment
		'babel-plugin-transform-import-meta'
	]
};
