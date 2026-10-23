import { config } from '@/lib/config';
import { LocalAgent } from './localAgent';
import { MockAgent } from './mockAgent';
import type { DeviceAgent, MockAgentControls } from './types';

export function createAgent(): DeviceAgent {
  return config.agentMode === 'local' ? new LocalAgent(config.agentUrl) : new MockAgent();
}

export function mockControls(agent: DeviceAgent): MockAgentControls | null {
  return agent instanceof MockAgent ? agent : null;
}

export type {
  AgentEvent, AgentStatus, CameraInfo, DeviceAgent, MockAgentControls, PreviewSource, RecordingResult,
} from './types';
