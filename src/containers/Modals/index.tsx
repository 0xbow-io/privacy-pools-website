import { NewsletterSubscriptionModal } from '~/components';
import { MigrationModal } from '~/migration';
import { ActivityDetails } from './ActivityDetails';
import { ConnectModal } from './Connect';
import { CustomRpcModal } from './CustomRpc';
import { DepositModal } from './Deposit';
import { ExitConfirmModal } from './ExitConfirm';
import { GeneratingModal } from './GeneratingZkProof';
import { PoolDetails } from './PoolDetails';
import { ProcessingwModal } from './Processing';
import { ReviewModal } from './Review';
import { SelfReportModal } from './SelfReport';
import { SuccessModal } from './Success';
import { WithdrawModal } from './Withdraw';

export const Modals = () => {
  return (
    <>
      <PoolDetails />
      <ActivityDetails />
      <DepositModal />
      <WithdrawModal />
      <ReviewModal />
      <ProcessingwModal />
      <SuccessModal />
      <GeneratingModal />
      <ConnectModal />
      <MigrationModal />
      <NewsletterSubscriptionModal />
      <ExitConfirmModal />
      <SelfReportModal />
      <CustomRpcModal />
    </>
  );
};
