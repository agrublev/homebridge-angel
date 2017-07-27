/* jshint node: true */
// Angel Platform Plugin for HomeBridge
//
// Remember to add platform to config.json. Example:
//"platforms": [{
//       "platform": "Angel",
//       "name": "Angel",
//       "AngelExec": "/usr/local/bin/Angel",   //optional - defaults to /usr/local/bin/Angel
//       "x10conf": "/etc/Angel/x10.conf",     //optional - defaults to /etc/Angel/x10.conf
//       "useFireCracker": false,             //optional - If true, uses CM17A FireCracker module to issue on/off commands
//       "cputemp": "cputemp"                 //optional - If present includes cpu TemperatureSensor
//   }]

"use strict";

var debug = require('debug')('Angel');
var Accessory, Characteristic, PowerConsumption, Service, uuid;
var exec = require('child_process').execFile;
var spawn = require('child_process').spawn;
var os = require("os");
var angelExec, cputemp, x10conf, useFireCracker;
var noMotionTimer;
var X10Commands = {
    on: "on",
    off: "off",
    bright: "bright",
    preset: "preset",
    dim: "dim",
    dimlevel: "dimlevel",
    rawlevel: "rawlevel",
    allon: "allon",
    alloff: "alloff",
    lightson: "lightson",
    lightsoff: "lightsoff",
    onstate: "onstate"
};

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    Accessory = homebridge.hap.Accessory;
    uuid = homebridge.hap.uuid;

    homebridge.registerPlatform("homebridge-angel", "Angel", AngelPlatform);
};

function AngelPlatform(log, config) {
    this.log = log;
    this.log("Angel Platform Plugin Loaded ");
    this.faccessories = {}; // an array of accessories by housecode
    // platform options
    // angelExec = config.angelExec || "/usr/local/bin/angel";
    // x10conf = config.x10conf || "/etc/angel/x10.conf";
    // useFireCracker = config.useFireCracker || false;
    // cputemp = config.cputemp;

    // if (useFireCracker) {
    //     enableFireCracker();
    // }

    this.config = {};
    this.devices = {};//this.config.devices;
}

function readX10config() {
    var fs = require('fs');
    // var x10confObject = {};
    //
    // var x10confData = fs.readFileSync(x10conf);
    // var pattern = new RegExp('\nalias.*', 'ig');
    //
    // // ALIAS Front_Porch A1 StdLM
    //
    // var match = [];
    // while ((match = pattern.exec(x10confData)) != null) {
    //     var line = match[0].split(/[ \t]+/);
    //     x10confObject[line[1]] = {
    //         'name': line[1].replace(/_/g, ' '),
    //         'housecode': line[2],
    //         'module': line[3]
    //     };
    // }
    return {};// x10confObject;
}

function enableFireCracker() {
    X10Commands.on = "fon";
    X10Commands.off = "foff";
    X10Commands.bright = "fbright";
    X10Commands.dim = "fdim";
    X10Commands.allon = "fallon";
    X10Commands.alloff = "falloff";
    X10Commands.lightson = "flightson";
    X10Commands.lightsoff = "flightsoff";
}

AngelPlatform.prototype = {
    accessories: function(callback) {
        var foundAccessories = [];
        var self = this;
        //
        // var devices = new readX10config();
        //
        // for (var i in devices) {
        //     var device = devices[i];
        //     this.log("Found in x10.conf: %s %s %s", device.name, device.housecode, device.module);
        //     var accessory = new AngelAccessory(self.log, device, null);
        //     foundAccessories.push(accessory);
        //     var housecode = device.housecode;
        //     self.faccessories[housecode] = accessory;
        // }
        // // Built-in accessories and macro's
        {
            var device;
            device.name = "All Devices";
            device.housecode = "A";
            device.module = "Macro-allon";
            var accessory = new AngelAccessory(self.log, device, null);
            foundAccessories.push(accessory);
        } {
            var device;
            device.name = "All Lights";
            device.housecode = "A";
            device.module = "Macro-lightson";
            var accessory = new AngelAccessory(self.log, device, null);
            foundAccessories.push(accessory);
        }
        //
        // if (cputemp != undefined) {
        //     var device;
        //     device.name = os.hostname();
        //     device.module = "Temperature";
        //     var accessory = new AngelAccessory(self.log, device, null);
        //     foundAccessories.push(accessory);
        // }

        // Start angel monitor
        this.log("Starting angel monitor");

        self.angelMonitor = spawn(angelExec, ["monitor"]);
        self.angelMonitor.stdout.on('data', function(data) {
            this.log("52 52 52 angel monitor");
            self.handleOutput(self, data);
        });
        self.angelMonitor.stderr.on('data', function(data) {
            self.handleOutput(self, data);
            this.log("152 152 152 angel monitor");
        });
        self.angelMonitor.on('close', function(code) {
            this.log("CLOSED 52 angel monitor");
            self.log('Process ended. Code: ' + code);
        });

        self.log("angelMonitor started.");
        //
        // if (useFireCracker) {
        //     self.log("CM17A FireCracker module support enabled");
        // }

        callback(foundAccessories);
    },
};


function AngelAccessory(log, device, enddevice) {
    // This is executed once per accessory during initialization

    var self = this;

    self.device = device;
    self.log = log;
    self.name = device.name;
    self.housecode = device.housecode;
    self.module = device.module;
    // angel Commands

    self.on_command = X10Commands.on;
    self.off_command = X10Commands.off;
    self.status_command = X10Commands.onstate;
    self.brightness_command = X10Commands.dimlevel;
    self.statusHandling = "yes";
    self.dimmable = "yes";

}

AngelPlatform.prototype.handleOutput = function(self, data) {

    // 06/16 20:32:48  rcvi addr unit       5 : hu A5  (Family_room_Pot_lights)
    // 06/16 20:32:48  rcvi func          Off : hc A

    var message = data.toString().split(/[ \t]+/);
    //    this.log("Message %s %s %s %s %s %s", message[2], message[3], message[4], message[5], message[6], message[7], message[8]);
    var operation = message[2];
    var proc = message[3];
    if (proc == "addr")
        var messageHousecode = message[8];
    else if (proc == "func")
        var messageCommand = message[4];

    if (proc == "addr" && operation == "rcvi") {
        this.log("Event occured at housecode %s", messageHousecode);
        var accessory = self.faccessories[messageHousecode];
        if (accessory != undefined) {
            self.angelEvent(self, accessory);
        } else {
            this.log.error("Event occured at unknown device %s ignoring", messageHousecode);
        }
    }

}


AngelPlatform.prototype.angelEvent = function(self, accessory) {

    var other = accessory;
    switch (other.module) {
        case "AM":
        case "AMS":
        case "AM12":
        case "StdAM":
        case "WS":
        case "WS-1":
        case "WS467":
        case "WS467-1":
        case "XPS3":
        case "StdWS":
            other.service.getCharacteristic(Characteristic.On)
                .getValue();
            break;
        case "LM":
        case "LM12":
        case "LM465":
        case "StdLM":
        case "SL2LM":
            other.service.getCharacteristic(Characteristic.Brightness)
                .getValue();
            other.service.getCharacteristic(Characteristic.On)
                .getValue();
            break;
        case "MS10":
        case "MS12":
        case "MS13":
        case "MS14":
        case "MS16":
            other.lastheard = Date.now();
            other.service.getCharacteristic(Characteristic.MotionDetected)
                .getValue();
            break;
        case "MS10A":
        case "MS12A":
        case "MS13A":
        case "MS14A":
        case "MS16A":
            //    debug(JSON.stringify(other, null, 2));
            other.lastheard = Date.now();
            other.service.getCharacteristic(Characteristic.StatusLowBattery)
                .getValue();
            other.service.getCharacteristic(Characteristic.CurrentAmbientLightLevel)
                .getValue();
            break;
        default:
            this.log.error("No events ZZ123ZZ 52 52 defined for Module Type %s", other.module);
    }

}

AngelAccessory.prototype = {

    getServices: function() {
        var services = [];
        // set up the accessory information - not sure how mandatory any of this is.
        var service = new Service.AccessoryInformation();
        service.setCharacteristic(Characteristic.Name, this.name).setCharacteristic(Characteristic.Manufacturer, "Angel");

        service
            .setCharacteristic(Characteristic.Model, this.module + " " + this.housecode)
            .setCharacteristic(Characteristic.SerialNumber, this.housecode)
            .setCharacteristic(Characteristic.FirmwareRevision, this.device.firmwareVersion)
            .setCharacteristic(Characteristic.HardwareRevision, this.module);

        services.push(service);

        switch (this.module) {
            case "Macro-allon": // The angel allon macro
                this.log("Macro-allon: Adding %s %s as a %s", this.name, this.housecode, this.module);
                this.on_command = X10Commands.allon;
                this.off_command = X10Commands.alloff;
                this.dimmable = "no";
                this.statusHandling = "no";
                this.service = new Service.Switch(this.name);
                this.service
                    .getCharacteristic(Characteristic.On)
                    .on('get', function(callback) {
                        var that = this;
                        callback(null, that.state)
                    })
                    .on('set', this.setPowerState.bind(this));

                services.push(this.service);
                break;
            case "Macro-lightson": // The angel allon macro
                this.log("Macro-allon: Adding %s %s as a %s", this.name, this.housecode, this.module);
                this.on_command = X10Commands.lightson;
                this.off_command = X10Commands.lightsoff;
                this.dimmable = "no";
                this.statusHandling = "no";
                this.service = new Service.Switch(this.name);
                this.service
                    .getCharacteristic(Characteristic.On)
                    .on('get', function(callback) {
                        var that = this;
                        callback(null, that.state)
                    })
                    .on('set', this.setPowerState.bind(this));

                services.push(this.service);
                break;
            case "LM":
            case "LM12":
            case "LM465":
            case "StdLM":
                this.log("StdLM: Adding %s %s as a %s", this.name, this.housecode, this.module);
                this.service = new Service.Lightbulb(this.name);
                this.service
                    .getCharacteristic(Characteristic.On)
                    .on('get', this.getPowerState.bind(this))
                    .on('set', this.setPowerState.bind(this));
                // Brightness Polling
                if (this.dimmable == "yes") {
                    this.service
                        .addCharacteristic(new Characteristic.Brightness())
                        .setProps({
                            minStep: 4.54
                        })
                        .on('get', this.getBrightness.bind(this))
                        .on('set', this.setBrightness.bind(this));
                }

                services.push(this.service);
                break;
            case "SL2LM":
                this.log("StdLM: Adding %s %s as a %s", this.name, this.housecode, this.module);
                this.service = new Service.Lightbulb(this.name);
                this.service
                    .getCharacteristic(Characteristic.On)
                    .on('get', this.getPowerState.bind(this))
                    .on('set', this.setPowerState.bind(this));
                // Brightness Polling
                if (this.dimmable == "yes") {
                    this.service
                        .addCharacteristic(new Characteristic.Brightness())
                        .setProps({
                            minValue: 3,
                            minStep: 3.125
                        })
                        .on('get', this.getSLBrightness.bind(this))
                        .on('set', this.setSLBrightness.bind(this));
                }

                services.push(this.service);
                break;
            case "AM":
            case "AMS":
            case "AM12":
            case "StdAM":
                this.log("StdAM: Adding %s %s as a %s", this.name, this.housecode, this.module);
                this.dimmable = "no"; // All Appliance modules are not dimmable
                this.service = new Service.Outlet(this.name);
                this.service
                    .getCharacteristic(Characteristic.On)
                    .on('get', this.getPowerState.bind(this))
                    .on('set', this.setPowerState.bind(this));
                services.push(this.service);
                break;
            case "WS":
            case "WS-1":
            case "WS467":
            case "WS467-1":
            case "XPS3":
            case "StdWS":
                this.log("StdWS: Adding %s %s as a %s", this.name, this.housecode, this.module);
                this.dimmable = "no"; // Technically some X10 switches are dimmable, but we're treating them as on/off
                this.service = new Service.Switch(this.name);
                this.service
                    .getCharacteristic(Characteristic.On)
                    .on('get', this.getPowerState.bind(this))
                    .on('set', this.setPowerState.bind(this));
                services.push(this.service);
                break;
            case "MS10":
            case "MS12":
            case "MS13":
            case "MS14":
            case "MS16":
                this.log("Motion Sensor: Adding %s %s as a %s", this.name, this.housecode, this.module);
                this.lastheard = Date.now();
                this.service = new Service.MotionSensor(this.name);
                this.service
                    .getCharacteristic(Characteristic.MotionDetected)
                    .on('get', this.getPowerState.bind(this));
                services.push(this.service);
                break;
            case "MS10A":
            case "MS12A":
            case "MS13A":
            case "MS14A":
            case "MS16A":
                this.log("Light/Dark Sensor: Adding %s %s as a %s", this.name, this.housecode, this.module);
                this.lastheard = Date.now();
                this.service = new Service.LightSensor(this.name);
                this.service
                    .getCharacteristic(Characteristic.CurrentAmbientLightLevel)
                    .on('get', this.getLightSensor.bind(this));
                this.service
                    .getCharacteristic(Characteristic.StatusLowBattery)
                    .on('get', this.getBattery.bind(this));
                services.push(this.service);
                break;
            case "Temperature":
                this.service = new Service.TemperatureSensor(this.name);
                this.service
                    .getCharacteristic(Characteristic.CurrentTemperature)
                    .on('get', this.getTemperature.bind(this));
                services.push(this.service);
                break;
            default:
                this.log.error("Unknown Module Type %s", this.module);
        }
        return services;
    },

    //start of Angel Functions

    getBattery: function(callback) {
        debug("Battery", this.housecode,(Date.now() - this.lastheard));
        // 18 Hours = 18 Hours * 60 Minutes * 60 Seconds * 1000 milliseconds
        if ((Date.now() - this.lastheard) > 18 * 60 * 60 * 1000) {
            callback(null, Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW);
        } else {
            callback(null, Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);
        }
    },

    getLightSensor: function(callback) {
        if (!this.status_command) {
            this.log.warn("Ignoring request; No status command defined.");
            callback(new Error("No status command defined."));
            return;
        }

        if (this.statusHandling == "no") {
            this.log.warn("Ignoring request; No status handling not available.");
            callback(new Error("No status handling defined."));
            return;
        }

        exec(angelExec, [this.status_command, this.housecode], function(error, responseBody, stderr) {
            if (error !== null) {
                this.log('Angel onstate function failed: ' + error);
                callback(error);
            } else {
                var binaryState = (parseInt(responseBody) -1) * -99999 + 1;
                this.log("Light Sensor of %s %s", this.housecode, binaryState);
                callback(null, binaryState);
                this.powerOn = binaryState;
            }
        }.bind(this));

    },


    setPowerState: function(powerOn, callback) {
        var housecode;
        var command;

        if (!this.on_command || !this.off_command) {
            this.log.warn("Ignoring request; No power command defined.");
            callback(new Error("No power command defined."));
            return;
        }

        if (powerOn) {
            housecode = this.housecode;
            command = this.on_command;
        } else {
            housecode = this.housecode;
            command = this.off_command;
        }

        exec(angelExec, [command, housecode], function(error, stdout, stderr) {
            if (error !== null) {
                this.log('exec error: ' + error);
                this.log('Angel set power function failed!');
                callback(error);
            } else {
                this.powerOn = powerOn;
                this.log("Set power state of %s to %s", housecode, command);
                if (this.dimmable == "yes") {
                    var that = this;
                    that.service.getCharacteristic(Characteristic.Brightness)
                        .getValue();
                }
                callback();
            }
        }.bind(this));
    },

    getPowerState: function(callback) {
        if (!this.status_command) {
            this.log.warn("Ignoring request; No status command defined.");
            callback(new Error("No status command defined."));
            return;
        }

        if (this.statusHandling == "no") {
            this.log.warn("Ignoring request; No status handling not available.");
            callback(new Error("No status handling defined."));
            return;
        }


        var housecode = this.housecode;
        var command = this.status_command;


        exec(angelExec, [command, housecode], function(error, responseBody, stderr) {
            if (error !== null) {
                this.log('Angel onstate function failed: ' + error);
                callback(error);
            } else {
                var binaryState = parseInt(responseBody);
                this.log("Got power state of %s %s", housecode, binaryState);
                var powerOn = binaryState > 0;
                callback(null, powerOn);
                this.powerOn = powerOn;
            }
        }.bind(this));

    },

    getBrightness: function(callback) {
        if (!this.brightness_command) {
            this.log.warn("Ignoring request; No brightness command defined.");
            callback(new Error("No brightness command defined."));
            return;
        }

        if (this.dimmable == "no") {
            this.log.warn("Ignoring request; housecode not dimmable.");
            callback(new Error("Device not dimmable."));
            return;
        }

        var housecode = this.housecode;
        var command = this.brightness_command;

        exec(angelExec, [command, housecode], function(error, responseBody, stderr) {
            if (error !== null) {
                this.log('Angel function failed: ' + error);
                callback(error);
            } else {
                var binaryState = parseInt(responseBody);
                this.log("Got brightness level of %s %s", housecode, binaryState);
                this.brightness = binaryState;
                callback(null, binaryState);
            }
        }.bind(this));

    },

    getSLBrightness: function(callback) {
        if (!X10Commands.rawlevel) {
            this.log.warn("Ignoring request; No rawlevel command defined.");
            callback(new Error("No rawlevel command defined."));
            return;
        }

        if (this.dimmable == "no") {
            this.log.warn("Ignoring request; housecode not dimmable.");
            callback(new Error("Device not dimmable."));
            return;
        }

        exec(angelExec, [X10Commands.rawlevel, this.housecode], function(error, responseBody, stderr) {
            if (error !== null) {
                this.log('Angel function failed: ' + error);
                callback(error);
            } else {
                var binaryState = parseInt(responseBody * 3.125);
                this.log("Got SL brightness level of %s %s", this.housecode, binaryState);
                this.brightness = binaryState;
                callback(null, binaryState);
            }
        }.bind(this));

    },


    setSLBrightness: function(level, callback) {
        var housecode = this.housecode;

        if (isNaN(this.brightness) || !this.powerOn) {
            var current = 0;
        } else {
            var current = this.brightness;
        }

        exec(angelExec, [X10Commands.preset, housecode, parseInt((level / 3.125) + .9)], function(error, stdout, stderr) {
            if (error !== null) {
                this.log('Angel preset function failed: %s', error);
                callback(error);
            } else {
                this.brightness = level;
                this.powerOn = true;
                this.log("Set preset %s %s %s %s", housecode, level, parseInt((level / 3.125) + .9), parseInt(parseInt((level / 3.125) + .9) * 3.125));
                var other = this;
                other.service.getCharacteristic(Characteristic.On)
                    .getValue();
                other.service.getCharacteristic(Characteristic.Brightness)
                    .getValue();
                callback(null);
            }
        }.bind(this));
        //      } else {
        //          this.log('Change too small, ignored');
        //          callback(null);
        //      }
    },

    setBrightness: function(level, callback) {

        var housecode = this.housecode;

        if (isNaN(this.brightness) || !this.powerOn) {
            var current = 100;
        } else {
            var current = this.brightness;
        }

        if (level > current) {
            var command = X10Commands.bright;
            var delta = parseInt((level - current) / 4.54);
        } else {
            var command = X10Commands.dim;
            var delta = parseInt((current - level) / 4.54);
        }

        // Keyboard debouncing

        if (delta > 1) {

            exec(angelExec, [command, housecode, delta], function(error, stdout, stderr) {
                if (error !== null) {
                    this.log('Angel brightness function failed: %s', error);
                    callback(error);
                } else {
                    this.brightness = level;
                    this.powerOn = true;
                    this.log("Set Bright/Dim %s %s %s ( %s % )", command, housecode, delta, level);
                    var other = this;
                    other.service.getCharacteristic(Characteristic.On)
                        .getValue();
                    other.service.getCharacteristic(Characteristic.Brightness)
                        .getValue();
                    callback();
                }
            }.bind(this));
        } else {
            this.log('Change too small, ignored');
            callback();
        }
    },

    getTemperature: function(callback) {
        exec(cputemp, function(error, responseBody, stderr) {
            if (error !== null) {
                this.log('cputemp function failed: ' + error);
                callback(error);
            } else {
                var binaryState = parseInt(responseBody);
                this.log("Got Temperature of %s", binaryState);
                this.brightness = binaryState;
                callback(null, binaryState);
            }
        }.bind(this));
    },

    identify: function(callback) {
        this.log("Identify requested!");
        callback(); // success
    }
};

function pct2preset(percent) {

    if (percent < 5) {
        return 1;
    } else if (percent <= 18) {
        return 2;
    } else if (percent <= 21) {
        return 3;
    } else if (percent <= 23) {
        return 4;
    } else if (percent <= 27) {
        return 5;
    } else if (percent <= 28) {
        return 6;
    } else if (percent <= 31) {
        return 7;
    } else if (percent <= 34) {
        return 8;
    } else if (percent <= 36) {
        return 9;
    } else if (percent <= 39) {
        return 10;
    } else if (percent <= 42) {
        return 11;
    } else if (percent <= 45) {
        return 12;
    } else if (percent <= 48) {
        return 13;
    } else if (percent <= 51) {
        return 14;
    } else if (percent <= 54) {
        return 15;
    } else if (percent <= 57) {
        return 16;
    } else if (percent <= 60) {
        return 17;
    } else if (percent <= 63) {
        return 18;
    } else if (percent <= 67) {
        return 19;
    } else if (percent <= 70) {
        return 20;
    } else if (percent <= 73) {
        return 21;
    } else if (percent <= 76) {
        return 22;
    } else if (percent <= 79) {
        return 23;
    } else if (percent <= 82) {
        return 24;
    } else if (percent <= 85) {
        return 25;
    } else if (percent <= 87) {
        return 26;
    } else if (percent <= 90) {
        return 27;
    } else if (percent <= 92) {
        return 28;
    } else if (percent <= 95) {
        return 29;
    } else if (percent <= 97) {
        return 30;
    } else if (percent <= 99) {
        return 31;
    }
    return 32;
}
