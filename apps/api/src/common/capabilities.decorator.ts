import { SetMetadata } from '@nestjs/common';
import type { Capability } from './capabilities';

export const CAPABILITIES_KEY = 'capabilities';
export const Capabilities = (...capabilities: Capability[]) => SetMetadata(CAPABILITIES_KEY, capabilities);
