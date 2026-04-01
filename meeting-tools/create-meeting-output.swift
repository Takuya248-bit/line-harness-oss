#!/usr/bin/env swift
// Meeting Output (Multi-Output Device) を CoreAudio API で作成
// BlackHole 2ch + スピーカー の同時出力装置
import CoreAudio
import Foundation

func getAllDeviceIDs() -> [AudioDeviceID] {
    var addr = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDevices,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain)
    var size: UInt32 = 0
    AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size)
    let count = Int(size) / MemoryLayout<AudioDeviceID>.size
    var ids = [AudioDeviceID](repeating: 0, count: count)
    AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size, &ids)
    return ids
}

func getDeviceName(_ id: AudioDeviceID) -> String? {
    var name: Unmanaged<CFString>? = nil
    var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
    var addr = AudioObjectPropertyAddress(
        mSelector: kAudioObjectPropertyName,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain)
    AudioObjectGetPropertyData(id, &addr, 0, nil, &size, &name)
    return name?.takeUnretainedValue() as String?
}

func getDeviceUID(_ id: AudioDeviceID) -> String? {
    var uid: Unmanaged<CFString>? = nil
    var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
    var addr = AudioObjectPropertyAddress(
        mSelector: kAudioDevicePropertyDeviceUID,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain)
    AudioObjectGetPropertyData(id, &addr, 0, nil, &size, &uid)
    return uid?.takeUnretainedValue() as String?
}

// デバイスUID取得
var blackholeUID: String? = nil
var speakerUID: String? = nil

for id in getAllDeviceIDs() {
    guard let name = getDeviceName(id), let uid = getDeviceUID(id) else { continue }
    if name.contains("BlackHole 2ch") { blackholeUID = uid }
    // 内蔵スピーカーはUIDで確実にマッチ
    if uid == "BuiltInSpeakerDevice" { speakerUID = uid }
}

guard let bh = blackholeUID else { print("エラー: BlackHole 2ch が見つかりません"); exit(1) }
guard let sp = speakerUID else { print("エラー: スピーカーが見つかりません"); exit(1) }

print("BlackHole UID: \(bh)")
print("スピーカー UID: \(sp)")

// Multi-Output Device 作成
let subDevices: [[String: Any]] = [
    [kAudioSubDeviceUIDKey: sp, kAudioSubDeviceDriftCompensationKey: 0],
    [kAudioSubDeviceUIDKey: bh, kAudioSubDeviceDriftCompensationKey: 1],
]

let desc: [String: Any] = [
    kAudioAggregateDeviceNameKey: "Meeting Output",
    kAudioAggregateDeviceUIDKey: "com.local.MeetingOutput",
    kAudioAggregateDeviceSubDeviceListKey: subDevices,
    kAudioAggregateDeviceMasterSubDeviceKey: sp,
    kAudioAggregateDeviceIsStackedKey: 1,  // 1 = Multi-Output Device
]

var newDeviceID: AudioDeviceID = 0
let status = AudioHardwareCreateAggregateDevice(desc as CFDictionary, &newDeviceID)

if status == noErr {
    print("Meeting Output 作成完了 (deviceID: \(newDeviceID))")
} else {
    print("エラー: OSStatus=\(status)")
    exit(1)
}
