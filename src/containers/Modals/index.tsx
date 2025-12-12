import { NewsletterSubscriptionModal } from '~/components';
import { ActivityDetails } from './ActivityDetails';
import { ConnectModal } from './Connect';
import { DepositModal } from './Deposit';
import { ExitConfirmModal } from './ExitConfirm';
import { GeneratingModal } from './GeneratingZkProof';
import { PoolDetails } from './PoolDetails';
import { ProcessingwModal } from './Processing';
import { ReviewModal } from './Review';
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
      <NewsletterSubscriptionModal />
      <ExitConfirmModal />
    </>
  );
};
