import Foundation
// AVAssetWriter's in-memory segments are remuxed to the existing server's non-fragmented MP4 contract.
// No file-backed AVAssetWriter or export is used. Every sample range stays inside an mdat.
public enum MP4 {
    struct Box { let kind: String; let start: Int; let payload: Int; let end: Int }
    static func u32(_ b: Data, _ p: Int) throws -> UInt32 { guard p >= 0, p <= b.count - 4 else { throw ChatError.invalid }; return b[p..<(p+4)].reduce(0) { ($0 << 8) | UInt32($1) } }
    static func u64(_ b: Data, _ p: Int) throws -> UInt64 { guard p >= 0, p <= b.count - 8 else { throw ChatError.invalid }; return b[p..<(p+8)].reduce(0) { ($0 << 8) | UInt64($1) } }
    static func boxes(_ b: Data, from: Int = 0, to: Int? = nil) throws -> [Box] {
        let end = to ?? b.count; guard from >= 0, end <= b.count, from <= end else { throw ChatError.invalid }
        var p = from, out: [Box] = []
        while p < end {
            guard out.count < 4096, end - p >= 8 else { throw ChatError.invalid }
            let raw = try u32(b, p); var size = Int(raw), header = 8
            if raw == 1 { let n = try u64(b, p+8); guard n <= UInt64(end-p) else { throw ChatError.invalid }; size = Int(n); header = 16 }
            if raw == 0 { size = end-p }
            guard size >= header, size <= end-p, let type = String(data: b[(p+4)..<(p+8)], encoding: .ascii) else { throw ChatError.invalid }
            out.append(Box(kind: type, start: p, payload: p+header, end: p+size)); p += size
        }
        return out
    }
    static func one(_ list: [Box], _ name: String) throws -> Box { let matches = list.filter { $0.kind == name }; guard matches.count == 1 else { throw ChatError.invalid }; return matches[0] }
    static func be(_ n: UInt32) -> Data { Data([UInt8(truncatingIfNeeded: n>>24), UInt8(truncatingIfNeeded: n>>16), UInt8(truncatingIfNeeded: n>>8), UInt8(truncatingIfNeeded: n)]) }
    static func atom(_ kind: String, _ bytes: Data) -> Data { be(UInt32(bytes.count+8)) + Data(kind.utf8) + bytes }
    static func full(_ kind: String, _ bytes: Data, version: UInt32 = 0) -> Data { atom(kind, be(version << 24) + bytes) }
    static func copy(_ data: Data, _ box: Box) -> Data { Data(data[box.start..<box.end]) }
    public static func validEnvelope(_ data: Data) -> Bool {
        guard data.count >= 32, data.count <= MediaPolicy.videoMax, let top = try? boxes(data), top.first?.kind == "ftyp", top.filter({ $0.kind == "ftyp" }).count == 1, top.filter({ $0.kind == "moov" }).count == 1, top.contains(where: { $0.kind == "mdat" && $0.end > $0.payload }), top.allSatisfy({ ["ftyp", "moov", "mdat", "free", "skip", "wide"].contains($0.kind) }) else { return false }; return true
    }
    struct Sample { let bytes: Data; let duration: UInt32; let flags: UInt32; let composition: Int32 }
    struct Track { let id: UInt32; let scale: UInt32; let box: Box; var samples: [Sample] = []; var defaultDuration: UInt32 = 0; var defaultSize: UInt32 = 0; var defaultFlags: UInt32 = 0 }
    public static func flatten(_ data: Data) throws -> Data {
        guard !data.isEmpty, data.count <= MediaPolicy.videoMax else { throw ChatError.tooLarge }
        let top = try boxes(data), moov = try one(top, "moov"), movie = try boxes(data, from: moov.payload, to: moov.end)
        let mdats = top.filter { $0.kind == "mdat" }; var tracks: [Track] = []
        for track in movie.filter({ $0.kind == "trak" }) {
            let children = try boxes(data, from: track.payload, to: track.end), tkhd = try one(children, "tkhd"), mdia = try one(children, "mdia"), media = try boxes(data, from: mdia.payload, to: mdia.end), mdhd = try one(media, "mdhd")
            guard tkhd.end-tkhd.payload >= 24, mdhd.end-mdhd.payload >= 20, data[tkhd.payload] == 0, data[mdhd.payload] == 0 else { throw ChatError.invalid }
            let id = try u32(data, tkhd.payload+12), scale = try u32(data, mdhd.payload+12)
            guard id > 0, scale > 0, !tracks.contains(where: { $0.id == id }) else { throw ChatError.invalid }; tracks.append(Track(id: id, scale: scale, box: track))
        }
        guard (1...2).contains(tracks.count) else { throw ChatError.invalid }
        if let mvex = movie.first(where: { $0.kind == "mvex" }) {
            for trex in try boxes(data, from: mvex.payload, to: mvex.end).filter({ $0.kind == "trex" }) {
                let id = try u32(data, trex.payload+4); guard let i = tracks.firstIndex(where: { $0.id == id }) else { throw ChatError.invalid }
                tracks[i].defaultDuration = try u32(data, trex.payload+12); tracks[i].defaultSize = try u32(data, trex.payload+16); tracks[i].defaultFlags = try u32(data, trex.payload+20)
            }
        }
        for fragment in top.filter({ $0.kind == "moof" }) {
            for traf in try boxes(data, from: fragment.payload, to: fragment.end).filter({ $0.kind == "traf" }) {
                let children = try boxes(data, from: traf.payload, to: traf.end), tfhd = try one(children, "tfhd"), flags = try u32(data, tfhd.payload) & 0x00ffffff, id = try u32(data, tfhd.payload+4)
                guard let ti = tracks.firstIndex(where: { $0.id == id }) else { throw ChatError.invalid }
                var cursor = tfhd.payload+8, base = fragment.start, duration = tracks[ti].defaultDuration, size = tracks[ti].defaultSize, defaultFlags = tracks[ti].defaultFlags
                if flags & 1 != 0 { let n = try u64(data, cursor); guard n <= UInt64(data.count) else { throw ChatError.invalid }; base = Int(n); cursor += 8 }
                if flags & 2 != 0 { guard try u32(data, cursor) == 1 else { throw ChatError.invalid }; cursor += 4 }
                if flags & 8 != 0 { duration = try u32(data, cursor); cursor += 4 }
                if flags & 16 != 0 { size = try u32(data, cursor); cursor += 4 }
                if flags & 32 != 0 { defaultFlags = try u32(data, cursor); cursor += 4 }
                guard cursor <= tfhd.end else { throw ChatError.invalid }
                var nextOffset: Int?
                for trun in children.filter({ $0.kind == "trun" }) {
                    let header = try u32(data, trun.payload), bits = header & 0x00ffffff, version = header >> 24, count = Int(try u32(data, trun.payload+4)); var p = trun.payload+8
                    guard count > 0, count <= 180000, tracks[ti].samples.count + count <= 180000, version <= 1 else { throw ChatError.invalid }
                    var offset: Int
                    if bits & 1 != 0 { let delta = Int(Int32(bitPattern: try u32(data, p))); p += 4; offset = base + delta } else if let nextOffset { offset = nextOffset } else { throw ChatError.invalid }
                    let firstFlags: UInt32?; if bits & 4 != 0 { firstFlags = try u32(data, p); p += 4 } else { firstFlags = nil }
                    for sampleIndex in 0..<count {
                        var d = duration, n = size, f = sampleIndex == 0 ? firstFlags ?? defaultFlags : defaultFlags, c: Int32 = 0
                        if bits & 0x100 != 0 { d = try u32(data, p); p += 4 }
                        if bits & 0x200 != 0 { n = try u32(data, p); p += 4 }
                        if bits & 0x400 != 0 { f = try u32(data, p); p += 4 }
                        if bits & 0x800 != 0 { let raw = try u32(data, p); p += 4; guard version == 1 || raw <= UInt32(Int32.max) else { throw ChatError.invalid }; c = Int32(bitPattern: raw) }
                        guard p <= trun.end, d > 0, n > 0, offset >= 0, Int(n) <= data.count-offset, mdats.contains(where: { offset >= $0.payload && offset + Int(n) <= $0.end }) else { throw ChatError.invalid }
                        tracks[ti].samples.append(Sample(bytes: Data(data[offset..<(offset+Int(n))]), duration: d, flags: f, composition: c)); offset += Int(n)
                    }
                    guard p == trun.end else { throw ChatError.invalid }; nextOffset = offset
                }
            }
        }
        guard tracks.allSatisfy({ !$0.samples.isEmpty && Double($0.samples.reduce(UInt64(0)) { $0 + UInt64($1.duration) }) / Double($0.scale) <= 30 }) else { throw ChatError.invalid }
        let ftyp = atom("ftyp", Data("isom".utf8) + be(0) + Data("isomiso2avc1mp41".utf8))
        var payload = Data(), offsets: [UInt32: UInt32] = [:]
        for t in tracks { offsets[t.id] = UInt32(ftyp.count+8+payload.count); for s in t.samples { payload.append(s.bytes) } }
        let mvhd = try one(movie, "mvhd"), movieScale = try u32(data, mvhd.payload+12); guard mvhd.end-mvhd.payload >= 20, data[mvhd.payload] == 0, movieScale > 0 else { throw ChatError.invalid }
        let seconds = tracks.map { Double($0.samples.reduce(UInt64(0)) { $0 + UInt64($1.duration) }) / Double($0.scale) }.max()!
        let tickCount = ceil(seconds * Double(movieScale)); guard tickCount <= Double(UInt32.max) else { throw ChatError.invalid }; let movieTicks = UInt32(tickCount)
        func patched(_ box: Box, offset: Int, value: UInt32) throws -> Data { var b = copy(data, box); guard offset >= 8, offset + 4 <= b.count else { throw ChatError.invalid }; b.replaceSubrange(offset..<(offset+4), with: be(value)); return b }
        func rebuildTrack(_ t: Track) throws -> Data {
            let ticks = t.samples.reduce(UInt64(0)) { $0 + UInt64($1.duration) }; guard ticks <= UInt32.max else { throw ChatError.invalid }
            var content = Data()
            for child in try boxes(data, from: t.box.payload, to: t.box.end) {
                if child.kind == "tkhd" { content.append(try patched(child, offset: 28, value: UInt32(ceil(Double(ticks) / Double(t.scale) * Double(movieScale))))); continue }
                if child.kind == "edts" { continue }
                guard child.kind == "mdia" else { content.append(copy(data, child)); continue }
                var media = Data()
                for m in try boxes(data, from: child.payload, to: child.end) {
                    if m.kind == "mdhd" { media.append(try patched(m, offset: 24, value: UInt32(ticks))); continue }
                    guard m.kind == "minf" else { media.append(copy(data, m)); continue }
                    var minf = Data()
                    for box in try boxes(data, from: m.payload, to: m.end) {
                        guard box.kind == "stbl" else { minf.append(copy(data, box)); continue }
                        let stsd = try one(boxes(data, from: box.payload, to: box.end), "stsd")
                        var table = copy(data, stsd), timings: [(UInt32, UInt32)] = [], compositions: [(UInt32, Int32)] = []
                        for s in t.samples {
                            if let last = timings.last, last.1 == s.duration { timings[timings.count-1].0 += 1 } else { timings.append((1, s.duration)) }
                            if let last = compositions.last, last.1 == s.composition { compositions[compositions.count-1].0 += 1 } else { compositions.append((1, s.composition)) }
                        }
                        table.append(full("stts", be(UInt32(timings.count)) + timings.reduce(Data()) { $0 + be($1.0) + be($1.1) }))
                        table.append(full("stsc", be(1) + be(1) + be(UInt32(t.samples.count)) + be(1)))
                        table.append(full("stsz", be(0) + be(UInt32(t.samples.count)) + t.samples.reduce(Data()) { $0 + be(UInt32($1.bytes.count)) }))
                        table.append(full("stco", be(1) + be(offsets[t.id]!)))
                        if t.samples.contains(where: { $0.composition != 0 }) { table.append(full("ctts", be(UInt32(compositions.count)) + compositions.reduce(Data()) { $0 + be($1.0) + be(UInt32(bitPattern: $1.1)) }, version: 1)) }
                        let sync = t.samples.enumerated().filter { $0.element.flags & 0x10000 == 0 }.map { UInt32($0.offset+1) }
                        if !sync.isEmpty { table.append(full("stss", be(UInt32(sync.count)) + sync.reduce(Data()) { $0 + be($1) })) }
                        minf.append(atom("stbl", table))
                    }
                    media.append(atom("minf", minf))
                }
                content.append(atom("mdia", media))
            }
            return atom("trak", content)
        }
        var movieData = Data()
        for box in movie {
            if box.kind == "mvhd" { movieData.append(try patched(box, offset: 24, value: movieTicks)) }
            else if box.kind == "trak" { guard let t = tracks.first(where: { $0.box.start == box.start }) else { throw ChatError.invalid }; movieData.append(try rebuildTrack(t)) }
            else if box.kind != "mvex" { movieData.append(copy(data, box)) }
        }
        let result = ftyp + atom("mdat", payload) + atom("moov", movieData)
        guard validEnvelope(result) else { throw ChatError.invalid }; return result
    }
}
