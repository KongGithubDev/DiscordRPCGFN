/**
 * IMPORTANT NOTE:
 * To disable, and hide any of the activity fields in your Rich Presence, set the value to: undefined,
 * Please refer to the documentation: https://github.com/Jxyme/simple-discord-rpc#configuration-file-1
 * and/or reach out via Discord with any questions: emyaj
 */

module.exports = {
  applicationId: '1368909699466137721', // your developer application id
  activity: {
    details: undefined,
    detailsUrl: undefined,
    state: undefined,
    stateUrl: undefined,
    party: {
      partySize: undefined,
      partyMax: undefined,
    },
    timestamps: {
      startTimestamp: undefined,
      endTimestamp: undefined,
    },
    assets: {
      largeImageKey: undefined,
      largeImageText: undefined,
      largeImageUrl: undefined,
      smallImageKey: undefined,
      smallImageText: undefined,
      smallImageUrl: undefined,
    },
    buttons: {
      primary: {
        label: undefined,
        url: undefined,
      },
      secondary: {
        label: undefined,
        url: undefined,
      },
    },
    type: 0, // Playing: 0, Listening to: 2, Watching: 3, or Competing in: 5
    statusDisplayType: 2, // Application Name: 0, State: 1, or Details: 2
  },
  connection: {
    maxRetries: 7, // number of retries to establish a connection with Discord (default: 7)
    retryInterval: 10, // number of seconds to wait in-between retries (default: 10)
  },
  gameDetection: {
    enabled: true, // enable automatic game detection from GeForce NOW
    checkInterval: 5, // seconds between checking for game changes
    defaultDetails: undefined, // fallback details when no game detected
    defaultState: undefined, // fallback state when no game detected
    formatString: 'Playing: {game}', // format for game display, use {game} as placeholder
    autoFetchImage: true, // automatically fetch game image from Steam
  },
}
