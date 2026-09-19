import test from "node:test";
import assert from "node:assert/strict";
import {EventEmitter} from "node:events";
import {DahuaOnvifClient,discoverOnvifDevices,onvifUsernameToken,parseDahuaKeyValue,parseDahuaTime,parseOnvifDeviceInformation,parseOnvifProfiles,parseOnvifSystemDateAndTime} from "../src/services/dahua-onvif-client.js";
import {videoAdapterFor} from "../src/services/video-adapters.js";

const deviceXml=`<Envelope><Body><GetDeviceInformationResponse><Manufacturer>Dahua</Manufacturer><Model>DHI-NVR2104-4KS3</Model><FirmwareVersion>V4.0</FirmwareVersion><SerialNumber>LAB-1</SerialNumber><HardwareId>NVR</HardwareId></GetDeviceInformationResponse></Body></Envelope>`;
const timeXml=`<Envelope><Body><GetSystemDateAndTimeResponse><UTCDateTime><Time><Hour>10</Hour><Minute>11</Minute><Second>12</Second></Time><Date><Year>2026</Year><Month>9</Month><Day>19</Day></Date></UTCDateTime></GetSystemDateAndTimeResponse></Body></Envelope>`;

test("V15 parses Dahua and ONVIF device, profile and clock responses",()=>{
  assert.deepEqual(parseOnvifDeviceInformation(deviceXml),{manufacturer:"Dahua",model:"DHI-NVR2104-4KS3",firmwareVersion:"V4.0",serialNumber:"LAB-1",hardwareId:"NVR"});
  assert.equal(parseOnvifSystemDateAndTime(timeXml).toISOString(),"2026-09-19T10:11:12.000Z");
  assert.deepEqual(parseOnvifProfiles('<trt:Profiles token="main"/><trt:Profiles token="sub"/>'),["main","sub"]);
  assert.deepEqual(parseDahuaKeyValue("deviceType=NVR\ntime=2026-09-19 13:11:12"),{deviceType:"NVR",time:"2026-09-19 13:11:12"});
  assert.equal(parseDahuaTime("time=2026-09-19 13:11:12").toISOString(),"2026-09-19T13:11:12.000Z");
});

test("V15 creates a WS-Security digest without exposing the password",()=>{
  const token=onvifUsernameToken("readonly","secret",new Date("2026-09-19T10:00:00Z"),Buffer.alloc(20,1));
  assert.match(token,/PasswordDigest/);assert.match(token,/readonly/);assert.doesNotMatch(token,/secret/);assert.match(token,/2026-09-19T10:00:00.000Z/);
});

test("V15 performs real ONVIF health and automatic time calls through an injectable transport",async()=>{
  const calls=[],fetchImpl=async(url,options)=>{calls.push({url:String(url),body:options.body});const body=options.body.includes("GetDeviceInformation")?deviceXml:timeXml;return {ok:true,status:200,text:async()=>body}};
  const client=new DahuaOnvifClient({endpoint:"http://192.168.1.108",username:"readonly",password:"secret",fetchImpl});
  const result=await client.connect();assert.equal(result.online,true);assert.equal(result.device.model,"DHI-NVR2104-4KS3");assert.equal(result.nvrTime.toISOString(),"2026-09-19T10:11:12.000Z");assert.equal(result.realConnectionPerformed,true);assert.equal(calls.length,2);assert.equal(JSON.stringify(calls).includes("secret"),false);
  const adapterResult=await videoAdapterFor("ONVIF").connect({endpoint:"http://192.168.1.108"},{client});assert.equal(adapterResult.realConnectionPerformed,true);
});

test("V15 discovers ONVIF XAddr devices over WS-Discovery",async()=>{
  class FakeSocket extends EventEmitter{send(message,port,address,callback){assert.equal(port,3702);assert.equal(address,"239.255.255.250");assert.match(message.toString(),/NetworkVideoTransmitter/);callback();queueMicrotask(()=>this.emit("message",Buffer.from('<Envelope><XAddrs>http://192.168.1.108/onvif/device_service</XAddrs><Scopes>onvif://www.onvif.org/name/Dahua</Scopes></Envelope>'),{address:"192.168.1.108"}))}close(){}}
  const devices=await discoverOnvifDevices({timeoutMs:5,socketFactory:()=>new FakeSocket()});assert.equal(devices[0].address,"192.168.1.108");assert.match(devices[0].xaddr,/device_service/);
});
