import { describe, it, expect, vi } from 'vitest';
import { FileTransferSender, FileTransferReceiver } from './transfer';
import { PeerConnectionManager } from './webrtc';

describe('WebRTC P2P Transfer Engine', () => {
  describe('16KB Chunking and Reassembly', () => {
    it('slices a file into exact 16KB chunks and reassembles byte-for-byte', async () => {
      // 50KB payload
      const testData = new Uint8Array(50 * 1024);
      for (let i = 0; i < testData.length; i++) {
        testData[i] = i % 256;
      }
      const originalBlob = new Blob([testData], { type: 'application/octet-stream' });

      // Mock DataChannels for sender and receiver
      const receiverEvents: { onmessage?: (e: any) => void } = {};
      const mockReceiverDc: any = {
        binaryType: 'arraybuffer',
        set onmessage(fn: any) {
          receiverEvents.onmessage = fn;
        },
        get onmessage() {
          return receiverEvents.onmessage;
        },
      };

      let completedProgress: any = null;
      const receiver = new FileTransferReceiver({
        dataChannel: mockReceiverDc,
        autoDownload: false,
        onComplete: (progress) => {
          completedProgress = progress;
        },
      });
      expect(receiver).toBeDefined();

      const mockSenderDc: any = {
        bufferedAmount: 0,
        bufferedAmountLowThreshold: 65536,
        send: vi.fn((data: any) => {
          // Route sent data directly to receiver
          if (receiverEvents.onmessage) {
            receiverEvents.onmessage({ data });
          }
        }),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };

      const sender = new FileTransferSender({
        dataChannel: mockSenderDc,
      });

      await sender.sendFile(originalBlob, 'testfile.bin');

      expect(completedProgress).toBeDefined();
      expect(completedProgress.size).toBe(testData.length);
      expect(completedProgress.name).toBe('testfile.bin');
      expect(completedProgress.blob).toBeDefined();

      const receivedBuffer = await completedProgress.blob.arrayBuffer();
      const receivedArray = new Uint8Array(receivedBuffer);

      expect(receivedArray.length).toBe(testData.length);
      expect(receivedArray).toEqual(testData);

      // Total expected chunks: ceil(51200 / 16384) = 4 binary slices + 1 META + 1 END = 6 total send() calls
      expect(mockSenderDc.send).toHaveBeenCalledTimes(6);
    });
  });

  describe('SCTP Backpressure Pause/Resume', () => {
    it('pauses sending when bufferedAmount exceeds 256KB and resumes on bufferedamountlow', async () => {
      // 300KB payload so multiple 16KB chunks are emitted
      const testData = new Uint8Array(300 * 1024);
      const originalBlob = new Blob([testData]);

      let lowListener: (() => void) | null = null;
      let pauseTriggered = false;

      const mockSenderDc: any = {
        bufferedAmount: 0,
        bufferedAmountLowThreshold: 65536,
        send: vi.fn(function (data: any) {
          if (data instanceof ArrayBuffer) {
            // Simulate buffer filling up on second chunk
            mockSenderDc.bufferedAmount += data.byteLength;
            if (mockSenderDc.bufferedAmount > 262144) {
              pauseTriggered = true;
            }
          }
        }),
        addEventListener: vi.fn((event: string, fn: any) => {
          if (event === 'bufferedamountlow') {
            lowListener = fn;
            // Simulate buffer draining after a microtask
            setTimeout(() => {
              mockSenderDc.bufferedAmount = 0;
              if (lowListener) lowListener();
            }, 10);
          }
        }),
        removeEventListener: vi.fn((event: string, fn: any) => {
          if (event === 'bufferedamountlow' && lowListener === fn) {
            lowListener = null;
          }
        }),
      };

      const sender = new FileTransferSender({
        dataChannel: mockSenderDc,
      });

      await sender.sendFile(originalBlob, 'backpressure-test.bin');

      expect(pauseTriggered).toBe(true);
      expect(mockSenderDc.addEventListener).toHaveBeenCalledWith('bufferedamountlow', expect.any(Function));
    });
  });

  describe('Candidate Queueing until RemoteDescription', () => {
    it('queues ICE candidates until remoteDescription is applied', async () => {
      const mockPc: any = {
        addIceCandidate: vi.fn().mockResolvedValue(undefined),
        setRemoteDescription: vi.fn().mockImplementation(async () => {
          mockPc.remoteDescription = { type: 'offer', sdp: 'fake' };
        }),
        setLocalDescription: vi.fn().mockResolvedValue(undefined),
        createAnswer: vi.fn().mockResolvedValue({ type: 'answer', sdp: 'fake-answer' }),
        close: vi.fn(),
      };

      // Mock RTCPeerConnection globally
      const origRTCPeerConnection = global.RTCPeerConnection;
      const origRTCSessionDescription = global.RTCSessionDescription;
      const origRTCIceCandidate = global.RTCIceCandidate;

      function MockRTCPeerConnection() {
        return mockPc;
      }
      function MockRTCSessionDescription(init: any) {
        return init;
      }
      function MockRTCIceCandidate(init: any) {
        return init;
      }

      (global as any).RTCPeerConnection = MockRTCPeerConnection;
      (global as any).RTCSessionDescription = MockRTCSessionDescription;
      (global as any).RTCIceCandidate = MockRTCIceCandidate;

      try {
        const p2p = new PeerConnectionManager();

        const candidate1 = { candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 };
        const candidate2 = { candidate: 'candidate:2', sdpMid: '0', sdpMLineIndex: 0 };

        // Add candidates before remote description is set
        await p2p.addIceCandidate(candidate1);
        await p2p.addIceCandidate(candidate2);

        expect(p2p.getPendingCandidateCount()).toBe(2);
        expect(mockPc.addIceCandidate).not.toHaveBeenCalled();

        // Now apply remote offer
        await p2p.handleOffer({ type: 'offer', sdp: 'fake-sdp' });

        expect(p2p.isRemoteDescriptionSet()).toBe(true);
        expect(p2p.getPendingCandidateCount()).toBe(0);
        expect(mockPc.addIceCandidate).toHaveBeenCalledTimes(2);
        expect(mockPc.addIceCandidate).toHaveBeenCalledWith(candidate1);
        expect(mockPc.addIceCandidate).toHaveBeenCalledWith(candidate2);
      } finally {
        global.RTCPeerConnection = origRTCPeerConnection;
        global.RTCSessionDescription = origRTCSessionDescription;
        global.RTCIceCandidate = origRTCIceCandidate;
      }
    });
  });
});
