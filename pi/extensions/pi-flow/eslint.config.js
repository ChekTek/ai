import { config } from "@elgato/eslint-config";
import globals from "globals";

export default [
	{ ignores: ["node_modules/**"] },
	...config.strict,
	{
		files: ["**/*.{ts,js}"],
		rules: {
			"@typescript-eslint/member-ordering": "off",
			"jsdoc/require-jsdoc": "off",
		},
	},
	{
		files: ["web/**/*.js"],
		languageOptions: {
			globals: globals.browser,
			sourceType: "module",
		},
	},
];
