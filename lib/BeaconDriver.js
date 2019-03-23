"use strict";

const Homey = require('homey');

class BeaconDriver extends Homey.Driver {

    /**
     * @abstract
     *
     * the name of the BLE for identification
     */
    getBleName() {
        throw new Error('todo: Implement getBleName into child class');
    }

    /**
     * on init the driver
     */
    onInit() {
        console.log('Beacon driver ' + this.getBleName() + ' is running...');
        this._scanning();
    }

    /**
     * @private
     *
     * set a new timeout for synchronisation
     */
    _setNewTimeout () {
        setTimeout(this._scanning.bind(this), 1000 * Homey.ManagerSettings.get('updateInterval'))
    }

    /**
     * @private
     *
     * start the synchronisation
     */
    _scanning () {
        try {
            let devices = this.getDevices()

            // @todo remove
            // testing one
            // let devices = [];
            // if(this.getDevices().length !== 0) {
            //     devices.push(this.getDevices()[0]);
            // }

            let updateDevicesTime = new Date()

            if (devices.length > 0) {
                Homey.app.updateDevices(devices).then(() => {
                    console.log('All devices are synced complete in: ' +
                      (new Date() - updateDevicesTime) / 1000 + ' seconds')
                        Homey.app.sendLog();
                    console.log(
                      '------------------------------------------------------------------------------------------------------------------------------------------------')

                    console.log('set timeout 2')
                    this._setNewTimeout()
                }).catch(error => {
                    this._setNewTimeout()
                    console.log('set timeout 3')
                    throw new Error(error)
                })
            }
        } catch (error) {
            this._setNewTimeout()
            console.log('set timeout 4')
            console.log(error)
        }
    }

    /**
     * render a list of devices for pairing to homey
     *
     * @param data
     * @param callback
     */
    onPairListDevices(data, callback) {
        console.log('onPairListDevices');
        Homey.app.discoverDevices(this)
            .then(devices => {
                callback(null, devices);
            })
            .catch(error => {
                callback(new Error('Cannot get devices:' + error));
            });
    }
}

module.exports = BeaconDriver;
