import { Global, Module } from '@nestjs/common';
import { AccessPolicyService } from './access-policy.service';
import { AuditChainService } from './audit-chain.service';
import { DeviceSignatureService } from './device-signature.service';
import { StepUpAuthService } from './step-up-auth.service';

@Global()
@Module({
  providers: [AccessPolicyService, AuditChainService, DeviceSignatureService, StepUpAuthService],
  exports: [AccessPolicyService, AuditChainService, DeviceSignatureService, StepUpAuthService]
})
export class SecurityModule {}
