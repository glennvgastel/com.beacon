'use strict'

const Homey = require('homey')

class Beacon extends Homey.App {

    /**
     * on init the app
     */
    onInit () {
        console.log('Successfully init Beacon app version: %s',
          Homey.app.manifest.version)

        if (!Homey.ManagerSettings.get('timeout')) {
            Homey.ManagerSettings.set('timeout', 5)
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

        this.logTrigger = new Homey.FlowCardTrigger('log')
        this.logTrigger.register()

        this.beaconInsideRange = new Homey.FlowCardTrigger(
          'beacon_inside_range')
        this.beaconInsideRange.register()

        this.deviceBeaconInsideRange = new Homey.FlowCardTriggerDevice(
          'device_beacon_inside_range')
        this.deviceBeaconInsideRange.register()

        this.beaconOutsideRange = new Homey.FlowCardTrigger(
          'beacon_outside_range')
        this.beaconOutsideRange.register()

        this.deviceBeaconOutsideRange = new Homey.FlowCardTriggerDevice(
          'device_beacon_outside_range')
        this.deviceBeaconOutsideRange.register()

        this.beaconStateChanged = new Homey.FlowCardTrigger(
          'beacon_state_changed')
        this.beaconStateChanged.register()

        this.deviceBeaconStateChanged = new Homey.FlowCardTriggerDevice(
          'device_beacon_state_changed')
        this.deviceBeaconStateChanged.register()

        this.deviceBeaconIsInsideRange = new Homey.FlowCardCondition(
          'beacon_is_inside_range')
        this.deviceBeaconIsInsideRange.register()
        this.deviceBeaconIsInsideRange.registerRunListener((args, state) => {
            return args.device.getCapabilityValue('detect')
        })

        this._advertisements = []
        this._log = '';
    }

    /**
     * discover devices
     *
     * @param driver BeaconDriver
     * @returns {Promise.<object[]>}
     */
    discoverDevices (driver) {
        return new Promise((resolve, reject) => {
            try {
                this._searchDevices(driver).then((devices) => {
                    if (devices.length > 0) {
                        resolve(devices)
                    }
                    else {
                        reject('No devices found.')
                    }
                })
            } catch (exception) {
                reject(exception)
            }
        })
    }

    /**
     * @param message
     */
    log (message) {
        const logMessage = this._getDateTime(new Date()) + ' ' + message
        this._log += logMessage
        console.log(logMessage)
    }

    sendLog () {
        if (this.logTrigger) {
            this.logTrigger.trigger({
                'log': this._log,
            })
        }

        this._log = ''
    }

    /**
     * @param date Date
     * @returns {string}
     * @private
     */
    _getDateTime (date) {

        let hour = date.getHours()
        hour = (hour < 10 ? '0' : '') + hour

        let min = date.getMinutes()
        min = (min < 10 ? '0' : '') + min

        let sec = date.getSeconds()
        sec = (sec < 10 ? '0' : '') + sec

        let year = date.getFullYear()

        let month = date.getMonth() + 1
        month = (month < 10 ? '0' : '') + month

        let day = date.getDate()
        day = (day < 10 ? '0' : '') + day

        return day + '-' + month + '-' + year + ' ' + hour + ':' + min + ':' +
          sec
    }

    /**
     * update the devices one by one
     *
     * @param devices BeaconDevice[]
     *
     * @returns {Promise.<BeaconDevice[]>}
     */
    async updateDevices (devices) {
        return await devices.reduce((promise, device) => {
            // if never detected yet, set detected but don't trigger flow
            if (device.getCapabilityValue("detect") === null) {
                device.setCapabilityValue("detect", true);
            }
            return promise.then(() => {
                return Homey.app.updateDevice(device).then(() => {
                    Homey.app.log( device.getName() + '[✓]');
                    device.setDetect();
                    return device
                }).catch(error => {
                    Homey.app.log( device.getName() + '[x]');
                    device.setUndetect();
                })
            }).catch(error => {
                console.log(error)
            })
        }, Promise.resolve())
    }

    /**
     * connect to the sensor, update data and disconnect
     *
     * @param device BeaconDevice
     *
     * @returns {Promise.<BeaconDevice>}
     */
    async handleUpdateSequence (device) {

        let disconnectPeripheral = async () => {
            //console.log('disconnectPeripheral not registered yet')
        }

        const advertisement = await Homey.ManagerBLE.find(device.getData().uuid, Homey.ManagerSettings.get('timeout') * 1000)

        console.log('connect');
        const peripheral = await advertisement.connect();

        disconnectPeripheral = async () => {
            try {
                console.log('try to disconnect peripheral')
                if (peripheral.isConnected) {
                    console.log('disconnect peripheral')
                    return await peripheral.disconnect()
                }
            } catch (err) {
                throw new Error(err)
            }
        }

        if (peripheral) {
            await disconnectPeripheral()

            return device
        }
        else {
            throw new Error('Coult not connect to peripheral')
        }
    }

    /**
     * update the devices one by one
     *
     * @param device BeaconDevice
     *
     * @returns {Promise.<BeaconDevice>}
     */
    async updateDevice (device) {
        return await Homey.app.handleUpdateSequence(device);
    }

    /**
     * discover beacons
     *
     * @returns {Promise.<BeaconDevice[]>}
     */
    _discoverAdvertisements () {
        const app = this
        return new Promise((resolve, reject) => {
            Homey.ManagerBLE.discover([],
              Homey.ManagerSettings.get('timeout') * 1000)
             .then(function (advertisements) {
                  app._advertisements = []
                  advertisements.forEach(advertisement => {
                      app._advertisements.push(advertisement)
                  })
                  resolve(advertisements)
              })
            .catch(error => {
                  reject(error)
              })
        })
    }

    /**
     * discover devices
     *
     * @param driver BeaconDriver
     * @returns {Promise.<object[]>}
     */
    _searchDevices (driver) {
        const app = this
        return new Promise((resolve, reject) => {
            let devices = []
            let currentUuids = []
            driver.getDevices().forEach(device => {
                let data = device.getData()
                currentUuids.push(data.uuid)
            })

            const promise = this._discoverAdvertisements().
              then((advertisements) => {
                  return advertisements.filter(function (advertisement) {
                      return (currentUuids.indexOf(advertisement.uuid) === -1)
                  })
              })

            promise.then((advertisements) => {
                if (advertisements.length === 0) {
                    resolve([])
                }

                advertisements.forEach(function (advertisement) {
                    if (advertisement.localName !== undefined) {
                        devices.push({
                            'name': advertisement.localName,
                            'data': {
                                'id': advertisement.id,
                                'uuid': advertisement.uuid,
                                'address': advertisement.uuid,
                                'name': advertisement.localName,
                                'type': advertisement.type,
                                'version': 'v' + Homey.manifest.version,
                            },
                            'capabilities': ['detect'],
                        })
                    }
                })

                resolve(devices)
            }).catch((error) => {
                reject(error)
            })
        })
    }
}

module.exports = Beacon