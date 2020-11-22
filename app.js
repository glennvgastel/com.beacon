'use strict';

const Homey = require('homey');
const BeaconDetectingService = require('./lib/beacon-detecting-service.js')

class Beacon extends Homey.App {

    isPairing = false;

    constructor(manifest) {
        super(manifest);

        this.beaconDetectingService = new BeaconDetectingService();
    }

    /**
     * on init the app
     */
    async onInit() {

        console.log('Successfully init Beacon app version: %s', Homey.app.manifest.version);

        if (!Homey.ManagerSettings.get('timeout')) {
            Homey.ManagerSettings.set('timeout', 10)
        }

        if (!Homey.ManagerSettings.get('updateInterval')) {
            Homey.ManagerSettings.set('updateInterval', 10)
        }

        if (!Homey.ManagerSettings.get('verificationAmountInside')) {
            Homey.ManagerSettings.set('verificationAmountInside', 1)
        }

        if (!Homey.ManagerSettings.get('verificationAmountOutside')) {
            Homey.ManagerSettings.set('verificationAmountOutside', 5)
        }

        this.logTrigger = new Homey.FlowCardTrigger('log');
        this.logTrigger.register();

        this.beaconInsideRange = new Homey.FlowCardTrigger('beacon_inside_range');
        this.beaconInsideRange.register();

        this.deviceBeaconInsideRange = new Homey.FlowCardTriggerDevice('device_beacon_inside_range');
        this.deviceBeaconInsideRange.register();

        this.beaconOutsideRange = new Homey.FlowCardTrigger('beacon_outside_range');
        this.beaconOutsideRange.register();

        this.deviceBeaconOutsideRange = new Homey.FlowCardTriggerDevice('device_beacon_outside_range');
        this.deviceBeaconOutsideRange.register();

        this.beaconStateChanged = new Homey.FlowCardTrigger('beacon_state_changed');
        this.beaconStateChanged.register();

        this.deviceBeaconStateChanged = new Homey.FlowCardTriggerDevice('device_beacon_state_changed');
        this.deviceBeaconStateChanged.register();

        this.deviceBeaconIsInsideRange = new Homey.FlowCardCondition('beacon_is_inside_range')
        this.deviceBeaconIsInsideRange.register();
        this.deviceBeaconIsInsideRange.registerRunListener((args, state) => {
            return args.device.getCapabilityValue("detect");
        });

        this._advertisements = [];
        this._log = '';

        new Homey.FlowCardAction('update_beacon_presence')
            .register()
            .registerRunListener(async () => {
                return Promise.resolve(await this.scanning())
            });

        if (this._useTimeout()) {
            await this.scanning();
        }

        Homey.ManagerSettings.on('set', function (setting) {
            if (setting === 'useTimeout') {
                if (Homey.ManagerSettings.get('useTimeout') !== false) {
                    Homey.app.scanning()
                }
            }
        })
    }

    /**
     * @param message
     */
    log(message) {
        const logMessage = this._getDateTime(new Date()) + ' ' + message;
        this._log += logMessage;
        console.log(logMessage);
    }

    sendLog() {
        if (this.logTrigger) {
            this.logTrigger.trigger({
                'log': this._log
            })
        }

        this._log = '';
    }

    /**
     * @param date Date
     * @returns {string}
     * @private
     */
    _getDateTime(date) {

        let hour = date.getHours();
        hour = (hour < 10 ? "0" : "") + hour;

        let min = date.getMinutes();
        min = (min < 10 ? "0" : "") + min;

        let sec = date.getSeconds();
        sec = (sec < 10 ? "0" : "") + sec;

        let year = date.getFullYear();

        let month = date.getMonth() + 1;
        month = (month < 10 ? "0" : "") + month;

        let day = date.getDate();
        day = (day < 10 ? "0" : "") + day;

        return day + "-" + month + "-" + year + " " + hour + ":" + min + ":" + sec;
    }

    /**
     * @private
     *
     * set a new timeout for synchronisation
     */
    _setNewTimeout() {
        const seconds = Homey.ManagerSettings.get('updateInterval')
        console.log('try to scan again in ' + seconds + ' seconds')
        setTimeout(this.scanning.bind(this), 1000 * seconds)
    }

    /**
     * @private
     *
     * handle generic_beacon matches
     */
    async scanning() {
        console.log('start scanning')
        if (this._useTimeout() && this.isPairing) {
            console.log('stop scanning for now, try to pair')
            this._setNewTimeout();

            return;
        }

        try {
            let updateDevicesTime = new Date()
            const advertisements = await this._discoverAdvertisements(Homey.ManagerSettings.get('timeout') * 1000)
            if (advertisements.length !== 0) {
                let beacons = [];
                advertisements.forEach(advertisement => {
                    const beacon = Homey.app.beaconDetectingService.getBeaconFromAdvertisement(advertisement);
                    if (null !== beacon) {
                        beacons.push(beacon);
                    }
                });

                Homey.emit('update.beacon.status', beacons)
            }
            Homey.app.log('All devices are synced complete in: ' + (new Date() - updateDevicesTime) / 1000 + ' seconds')

            if (this._useTimeout()) {
                this._setNewTimeout()
            }

            return true
        } catch (error) {
            Homey.app.log(error.message)

            if (this._useTimeout()) {
                this._setNewTimeout()
            }

            return false
        }
    }

    /**
     * discover beacons
     *
     * @returns {Promise.<BeaconDevice[]>}
     */
    async _discoverAdvertisements(timeout = 10000) {
console.log('_discoverAdvertisements');
        return Homey.ManagerBLE.discover([], timeout)
            .then(advertisements => {
                this._advertisements = [];
                advertisements.forEach(advertisement => {
                    this._advertisements.push(advertisement);
                });

console.log(`return ${advertisements.length} advertisements`);
                return advertisements;
            });
    }

    /**
     * discover devices
     *
     * @param driver BeaconDriver
     * @returns {Promise.<object[]>}
     */
    async _searchDevices(driver) {
        let devices = [];
        let currentUuids = [];

        driver.getDevices().forEach(device => {
            let data = device.getData();
            currentUuids.push(data.uuid);
        });

        return this._discoverAdvertisements()
            .then((advertisements) => {
                return advertisements.filter(function (advertisement) {
                    return (currentUuids.indexOf(advertisement.uuid) === -1);
                });
            })
            .then((advertisements) => {
                if (advertisements.length === 0) {
                    return [];
                }
                advertisements.forEach(function (advertisement) {
                    // Because there are several type of beacons with different
                    //  settings and capabilities, a dedicated method is called.
                    let beacon = Homey.app.beaconDetectingService.getBeaconFromAdvertisement(advertisement)
                    if (null !== beacon && beacon.type === driver.getBeaconType()) {
                        let pairObject = Homey.app.beaconDetectingService.getMetaData(beacon);
                        pairObject.settings['type_name'] = driver.getBleName();
                        devices.push(pairObject);
                    }
                });

                return devices;
            })
    }

    _useTimeout() {
        return (Homey.ManagerSettings.get('useTimeout') !== false);
    }
}

module.exports = Beacon;
