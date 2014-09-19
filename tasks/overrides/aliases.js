module.exports = function(grunt)
{
	grunt.registerTask(
		'combine',
		'Builds a combined library file without minification', [
			'concat:development',
			'replace:development',
			'concat:worker',
			'replace:worker',
			'concat:displaygeneric',
			'replace:displaygeneric',
			'concat:displaycreatejs',
			'replace:displaycreatejs',
			'concat:displaypixi',
			'replace:displaypixi',
			'concat:game',
			'replace:game',
			'concat:tasks',
			'replace:tasks',
			'concat:states',
			'replace:states',
			'concat:sound',
			'replace:sound',
			'concat:captions',
			'replace:captions',
			'concat:interface',
			'replace:interface',
			'concat:translate',
			'replace:translate'
		]
	);
};