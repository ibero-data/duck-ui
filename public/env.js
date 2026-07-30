// Runtime configuration. The Docker entrypoint (inject-env.js) overwrites this
// file with values from environment variables; static deployments keep this
// empty default. Loaded as a classic script before the app bundle so
// window.env is ready when the store initializes.
window.env = {};
