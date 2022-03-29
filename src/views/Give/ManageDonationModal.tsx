import { isAddress } from "@ethersproject/address";
import { t, Trans } from "@lingui/macro";
import { Grid, Link, SvgIcon, Typography } from "@material-ui/core";
import { useTheme } from "@material-ui/core/styles";
import useMediaQuery from "@material-ui/core/useMediaQuery";
import { ChevronLeft } from "@material-ui/icons";
import { DataRow, InfoTooltip, Input, Modal, PrimaryButton, TertiaryButton } from "@olympusdao/component-library";
import MarkdownIt from "markdown-it";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useLocation } from "react-router-dom";
import { GiveBox as Box } from "src/components/GiveProject/GiveBox";
import { Project, RecordType } from "src/components/GiveProject/project.type";
import { NetworkId, OHM_DECIMAL_PLACES } from "src/constants";
import { shorten } from "src/helpers";
import { DecimalBigNumber } from "src/helpers/DecimalBigNumber/DecimalBigNumber";
import { Environment } from "src/helpers/environment/Environment/Environment";
import { getTotalDonated } from "src/helpers/GetTotalDonated";
import { getRedemptionBalancesAsync } from "src/helpers/GiveRedemptionBalanceHelper";
import { useWeb3Context } from "src/hooks/web3Context";
import { hasPendingGiveTxn, PENDING_TXN_EDIT_GIVE, PENDING_TXN_WITHDRAW } from "src/slices/GiveThunk";

import { ArrowGraphic } from "../../components/EducationCard";
import { IPendingTxn, txnButtonText } from "../../slices/PendingTxnsSlice";
import { CancelCallback, DonationInfoState, SubmitCallback } from "./Interfaces";

export type WithdrawSubmitCallback = {
  (walletAddress: string, eventSource: string, depositAmount: DecimalBigNumber): void;
};

type ManageModalProps = {
  isModalOpen: boolean;
  eventSource: string;
  submitEdit: SubmitCallback;
  submitWithdraw: WithdrawSubmitCallback;
  cancelFunc: CancelCallback;
  project?: Project;
  currentWalletAddress: string;
  currentDepositAmount: DecimalBigNumber; // As per IUserDonationInfo
  depositDate: string;
  yieldSent: string;
  recordType?: string;
};

const DECIMAL_PLACES = 2;
const ZERO_NUMBER: DecimalBigNumber = new DecimalBigNumber("0");

export function ManageDonationModal({
  isModalOpen,
  eventSource,
  submitEdit,
  submitWithdraw,
  cancelFunc,
  project,
  currentWalletAddress,
  currentDepositAmount,
  depositDate,
  yieldSent,
  recordType = RecordType.PROJECT,
}: ManageModalProps) {
  const location = useLocation();
  const { provider, address, connected, networkId } = useWeb3Context();
  const [totalDebt, setTotalDebt] = useState("");
  const [totalDonated, setTotalDonated] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  useEffect(() => {
    // We use dispatch to asynchronously fetch the results, and then update state variables so that the component refreshes
    // We DO NOT use dispatch here, because it will overwrite the state variables in the redux store, which then creates havoc
    // e.g. the redeem yield page will show someone else's deposited sOHM and redeemable yield
    if (project) {
      getRedemptionBalancesAsync({
        networkID: networkId,
        provider: provider,
        address: project.wallet,
      })
        .then(resultAction => {
          setTotalDebt(resultAction.redeeming.recipientInfo.totalDebt);
        })
        .catch(e => console.log(e));

      getTotalDonated({
        networkID: networkId,
        provider: provider,
        address: project.wallet,
      })
        .then(donatedAmount => {
          setTotalDonated(donatedAmount);
        })
        .catch(e => console.log(e));
    }
  }, [connected, networkId]);

  useEffect(() => {
    checkIsWalletAddressValid(getWalletAddress());
  }, []);

  useEffect(() => {
    if (!isModalOpen) {
      // When we close the modal, we ensure button click states are reset
      setIsEditing(false);
      setIsWithdrawing(false);
    }
  }, [isModalOpen]);

  const _initialDepositAmount = currentDepositAmount.toString();
  const _initialWalletAddress = currentWalletAddress;
  const _initialDepositAmountValid = false;
  const _initialDepositAmountValidError = "";
  const _initialWalletAddressValid = false;
  const _initialIsAmountSet = false;

  const [depositAmount, setDepositAmount] = useState(_initialDepositAmount);
  const [isDepositAmountValid, setIsDepositAmountValid] = useState(_initialDepositAmountValid);
  const [isDepositAmountValidError, setIsDepositAmountValidError] = useState(_initialDepositAmountValidError);

  const [walletAddress, setWalletAddress] = useState(_initialWalletAddress);
  const [isWalletAddressValid, setIsWalletAddressValid] = useState(_initialWalletAddressValid);

  const [isAmountSet, setIsAmountSet] = useState(_initialIsAmountSet);
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down("xs"));

  const sohmBalance: string = useSelector((state: DonationInfoState) => {
    return networkId === NetworkId.TESTNET_RINKEBY && Environment.isMockSohmEnabled(location.search)
      ? state.account.balances && state.account.balances.mockSohm
      : state.account.balances && state.account.balances.sohm;
  });

  const isAccountLoading: boolean = useSelector((state: DonationInfoState) => {
    return state.account.loading;
  });

  const isGiveLoading: boolean = useSelector((state: DonationInfoState) => {
    return networkId === NetworkId.TESTNET_RINKEBY && Environment.isMockSohmEnabled(location.search)
      ? state.account.mockGiving.loading
      : state.account.giving.loading;
  });

  const pendingTransactions: IPendingTxn[] = useSelector((state: DonationInfoState) => {
    return state.pendingTransactions;
  });

  /**
   * Checks if the provided wallet address is valid.
   *
   * This will return false if:
   * - it is an invalid Ethereum address
   * - it is the same as the sender address
   *
   * @param {string} value the proposed value for the wallet address
   */
  const checkIsWalletAddressValid = (value: string) => {
    if (!isAddress(value)) {
      setIsWalletAddressValid(false);
      return;
    }

    if (value == address) {
      setIsWalletAddressValid(false);
      return;
    }

    setIsWalletAddressValid(true);
  };

  const handleEditSubmit = () => {
    const depositAmountBig: DecimalBigNumber = new DecimalBigNumber(depositAmount);

    submitEdit(getWalletAddress(), eventSource, depositAmountBig, getDepositAmountDiff());
  };

  const handleWithdrawSubmit = () => {
    const depositAmountBig: DecimalBigNumber = new DecimalBigNumber(depositAmount);

    submitWithdraw(getWalletAddress(), eventSource, depositAmountBig);
  };

  /**
   * Indicates whether the form can be submitted.
   *
   * This will return false if:
   * - the deposit amount is invalid
   * - the wallet address is invalid
   * - there is no sender address
   * - an add/edit transaction is pending
   * - it is not in create mode and there is no difference in the amount
   *
   * @returns boolean
   */
  const canSubmit = (): boolean => {
    if (!isDepositAmountValid) return false;

    if (isAccountLoading || isGiveLoading) return false;

    // The wallet address is only set when a project is not given
    if (!project && !isWalletAddressValid) return false;

    if (!address) return false;
    if (hasPendingGiveTxn(pendingTransactions)) return false;
    if (getDepositAmountDiff().eq(ZERO_NUMBER)) return false;

    return true;
  };

  const canWithdraw = () => {
    if (!address) return false;
    if (hasPendingGiveTxn(pendingTransactions)) return false;

    return true;
  };

  const getSOhmBalance = (): DecimalBigNumber => {
    return new DecimalBigNumber(sohmBalance);
  };

  const getCurrentDepositAmount = (): DecimalBigNumber => {
    if (!currentDepositAmount) return ZERO_NUMBER;

    return currentDepositAmount;
  };

  /**
   * Returns the maximum deposit that can be directed to the recipient.
   *
   * This is equal to the current wallet balance and the current deposit amount (in the vault).
   *
   * @returns BigNumber
   */
  const getMaximumDepositAmount = (): DecimalBigNumber => {
    return new DecimalBigNumber(sohmBalance).add(getCurrentDepositAmount());
  };

  const getDepositAmountDiff = (): DecimalBigNumber => {
    // We can't trust the accuracy of floating point arithmetic of standard JS libraries, so we use BigNumber
    return new DecimalBigNumber(depositAmount).sub(getCurrentDepositAmount());
  };

  const handleSetDepositAmount = (value: string) => {
    checkIsDepositAmountValid(value);
    setDepositAmount(value);
  };

  const checkIsDepositAmountValid = (value: string) => {
    const valueNumber = new DecimalBigNumber(value);
    const sOhmBalanceNumber = getSOhmBalance();

    if (!value || value == "" || valueNumber.eq(ZERO_NUMBER)) {
      setIsDepositAmountValid(false);
      setIsDepositAmountValidError(t`Please enter a value`);
      return;
    }

    if (valueNumber.lt(ZERO_NUMBER)) {
      setIsDepositAmountValid(false);
      setIsDepositAmountValidError(t`Value must be positive`);
      return;
    }

    if (sOhmBalanceNumber.eq(ZERO_NUMBER)) {
      setIsDepositAmountValid(false);
      setIsDepositAmountValidError(t`You must have a balance of sOHM (staked OHM) to continue`);
    }

    if (valueNumber.gt(getMaximumDepositAmount())) {
      setIsDepositAmountValid(false);
      setIsDepositAmountValidError(t`Value cannot be more than your sOHM balance of ` + getMaximumDepositAmount());
      return;
    }

    setIsDepositAmountValid(true);
    setIsDepositAmountValidError("");
  };

  /**
   * Returns the wallet address. If a project is defined, it uses the
   * project wallet, else what was passed in as a parameter.
   */
  const getWalletAddress = (): string => {
    if (project) return project.wallet;

    return walletAddress;
  };

  /**
   * Returns the appropriate title of the recipient.
   * - No project: shortened wallet address
   * - Project without a separate owner value: project title
   * - Otherwise the project title and owner
   */
  const getRecipientTitle = (): string => {
    if (!project) return shorten(walletAddress);

    if (!project.owner) return project.title;

    return project.owner + " - " + project.title;
  };

  const getRenderedDetails = () => {
    return {
      __html: MarkdownIt({ html: true }).renderInline(project ? project.shortDescription : ""),
    };
  };

  const getModalTitle = (): string => {
    if (isEditing) {
      return "Edit";
    } else if (isWithdrawing) {
      return "Stop";
    } else {
      return "Manage";
    }
  };

  const handleGoBack = () => {
    if (isAmountSet) {
      setIsAmountSet(false);
    } else if (isEditing) {
      setIsEditing(false);
    } else if (isWithdrawing) {
      setIsWithdrawing(false);
    }
  };

  const handleClose = () => {
    // Reset state
    setIsAmountSet(false);
    setIsEditing(false);
    setIsWithdrawing(false);

    // Fire callback
    cancelFunc();
  };

  const getEscapeComponent = () => {
    // If on the edit/stop/confirmation screen, we provide a chevron to go back a step
    if (shouldShowEditConfirmationScreen() || shouldShowEditScreen() || shouldShowStopScreen()) {
      return (
        <Link onClick={() => handleGoBack()}>
          <SvgIcon color="primary" component={ChevronLeft} />
        </Link>
      );
    }

    // Don't display on the first screen
    return <></>;
  };

  /**
   * Content for initial screen (not editing or withdrawing)
   */
  const getInitialScreen = () => {
    return (
      <Grid container spacing={2}>
        <Grid item xs={12}>
          {getRecipientDetails()}
        </Grid>
        {recordType === RecordType.PROJECT ? (
          <Grid item xs={12}>
            {getProjectStats()}
          </Grid>
        ) : (
          <></>
        )}
        <Grid item xs={12}>
          {getDonationDetails()}
        </Grid>
        <Grid item xs={12}>
          <Grid container>
            <Grid item xs />
            <Grid item xs={6}>
              <Grid container spacing={1}>
                <Grid item xs={12}>
                  <PrimaryButton onClick={() => setIsEditing(true)} fullWidth>
                    <Trans>Edit Donation</Trans>
                  </PrimaryButton>
                </Grid>
                <Grid item xs={12}>
                  <TertiaryButton onClick={() => setIsWithdrawing(true)} fullWidth>
                    <Trans>Stop Donation</Trans>
                  </TertiaryButton>
                </Grid>
              </Grid>
            </Grid>
            <Grid item xs />
          </Grid>
        </Grid>
      </Grid>
    );
  };

  /**
   * Elements to display project statistics, such as donation sOHM, yield and goal achievement.
   */
  const getProjectStats = () => {
    const depositGoalNumber = project ? new DecimalBigNumber(project.depositGoal.toString()) : ZERO_NUMBER;

    return (
      <Grid container spacing={2}>
        <Grid item xs={4}>
          <Box>
            <Typography variant="h5" align="center">
              {project ? depositGoalNumber.toString({ decimals: DECIMAL_PLACES, format: true }) : "N/A"}
            </Typography>
            <Typography variant="body1" align="center" className="subtext">
              {isSmallScreen ? "Goal" : "sOHM Goal"}
            </Typography>
          </Box>
        </Grid>
        <Grid item xs={4}>
          <Box>
            <Typography variant="h5" align="center">
              {project
                ? new DecimalBigNumber(totalDebt).toString({
                    decimals: DECIMAL_PLACES,
                    format: true,
                  })
                : "N/A"}
            </Typography>
            <Typography variant="body1" align="center" className="subtext">
              {isSmallScreen ? "Total sOHM" : "Total sOHM Donated"}
            </Typography>
          </Box>
        </Grid>
        <Grid item xs={4}>
          <Box>
            <Typography variant="h5" align="center">
              {project
                ? new DecimalBigNumber(totalDebt)
                    .mul(new DecimalBigNumber("100"), OHM_DECIMAL_PLACES)
                    .div(depositGoalNumber, OHM_DECIMAL_PLACES)
                    .toString({ decimals: DECIMAL_PLACES, format: true }) + "%"
                : "N/A"}
            </Typography>
            <Typography variant="body1" align="center" className="subtext">
              {isSmallScreen ? "of Goal" : "of sOHM Goal"}
            </Typography>
          </Box>
        </Grid>
      </Grid>
    );
  };

  /**
   * Returns elements detailing the user's donation
   */
  const getDonationDetails = () => {
    return (
      <>
        <Box>
          <DataRow title={t`Date`} balance={depositDate} />
          <DataRow title={t`Recipient`} balance={getRecipientTitle()} />
          <DataRow
            title={t`Deposited`}
            balance={`${new DecimalBigNumber(depositAmount).toString({
              format: true,
            })} sOHM`}
          />
          <DataRow
            title={t`Yield Sent`}
            balance={`${new DecimalBigNumber(yieldSent).toString({
              format: true,
            })} sOHM`}
          />
        </Box>
      </>
    );
  };

  /**
   * Renders the details of the recipient, whether a project or custom recipient.
   */
  const getRecipientDetails = () => {
    if (project) {
      return (
        <Grid container spacing={2}>
          <Grid item xs={3}>
            <Grid
              container
              alignContent="center"
              style={{ maxHeight: "184px", overflow: "hidden", borderRadius: "16px" }}
            >
              <Grid item xs>
                <img width="100%" src={`${process.env.PUBLIC_URL}${project.photos[0]}`} />
              </Grid>
            </Grid>
          </Grid>
          <Grid item xs>
            <Grid container>
              <Grid item xs={12}>
                <Typography variant="h6">{getRecipientTitle()}</Typography>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="body1" className="subtext">
                  <div dangerouslySetInnerHTML={getRenderedDetails()} />
                </Typography>
              </Grid>
            </Grid>
          </Grid>
        </Grid>
      );
    }

    return (
      <Grid container spacing={2} alignItems="center">
        <Grid item xs={3}>
          <Typography variant="h6">Custom Recipient</Typography>
        </Grid>
        <Grid item xs>
          <Typography variant="body2">{walletAddress}</Typography>
        </Grid>
      </Grid>
    );
  };

  /**
   * Indicates whether the edit confirmation screen should be displayed.
   *
   * The edit confirmation screen is displayed if the amount is set.
   *
   * @returns boolean
   */
  const shouldShowEditConfirmationScreen = () => {
    return isAmountSet;
  };

  /**
   * Edit screen before altering the amount
   */
  const shouldShowEditScreen = () => {
    return isEditing && !isAmountSet;
  };

  /**
   * Stop/withdraw screen
   */
  const shouldShowStopScreen = () => {
    return isWithdrawing;
  };

  const getEditDonationScreen = () => {
    return (
      <Grid container spacing={2}>
        <Grid item xs={12}>
          {getRecipientDetails()}
        </Grid>
        {recordType === RecordType.PROJECT ? (
          <Grid item xs={12}>
            {getProjectStats()}
          </Grid>
        ) : (
          <></>
        )}
        <Grid item xs={12}>
          <Box>
            <Grid container spacing={1}>
              <Grid item xs={12}>
                <Typography variant="body1">
                  <Trans>New sOHM Amount</Trans>
                  <InfoTooltip
                    message={t`Your sOHM will be tansferred into the vault when you submit. You will need to approve the transaction and pay for gas fees.`}
                    children={null}
                  />
                </Typography>
              </Grid>
              <Grid item xs={12}>
                <Input
                  id="amount-input"
                  type="number"
                  placeholder={t`Enter an amount`}
                  value={depositAmount}
                  // We need to inform the user about their deposit, so this is a specific value
                  helperText={
                    isDepositAmountValid
                      ? t`Your current deposit is ${currentDepositAmount.toString({
                          format: true,
                        })} sOHM`
                      : isDepositAmountValidError
                  }
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onChange={(e: any) => handleSetDepositAmount(e.target.value)}
                  error={!isDepositAmountValid}
                  startAdornment="sOHM"
                  endString={t`Max`}
                  // This uses toFixed() as it is a specific value and not formatted
                  endStringOnClick={() => handleSetDepositAmount(getMaximumDepositAmount().toString())}
                />
              </Grid>
            </Grid>
          </Box>
        </Grid>
        <Grid item xs={12}>
          <Grid container>
            <Grid item xs />
            <Grid item xs={6}>
              <PrimaryButton disabled={!canSubmit()} onClick={() => setIsAmountSet(true)} fullWidth>
                <Trans>Continue</Trans>
              </PrimaryButton>
            </Grid>
            <Grid item xs />
          </Grid>
        </Grid>
      </Grid>
    );
  };

  const getDonationConfirmationElement = () => {
    return (
      <Box>
        <Grid container spacing={1} alignItems="center">
          <Grid item xs={12} sm={4}>
            <Typography variant="body1" className="modal-confirmation-title">
              <Trans>Current sOHM deposit</Trans>
            </Typography>
            {/* Referring to the current deposit, so we need to be specific */}
            <Typography variant="h6">{currentDepositAmount.toString({ format: true })} sOHM</Typography>
          </Grid>
          {!isSmallScreen ? (
            <Grid item sm={4}>
              <ArrowGraphic />
            </Grid>
          ) : (
            <></>
          )}
          <Grid item xs={12} sm={4}>
            {/* On small screens, the current and new sOHM deposit numbers are stacked and left-aligned,
                whereas on larger screens, the numbers are on opposing sides of the box. This adjusts the
                alignment accordingly. */}
            <Grid container direction="column" alignItems={isSmallScreen ? "flex-start" : "flex-end"}>
              <Grid item xs={12}>
                <Typography variant="body1" className="modal-confirmation-title">
                  <Trans>New sOHM deposit</Trans>
                </Typography>
                {/* Referring to the new deposit, so we need to be specific */}
                <Typography variant="h6">
                  {isWithdrawing
                    ? "0"
                    : new DecimalBigNumber(depositAmount).toString({
                        format: true,
                      })}{" "}
                  sOHM
                </Typography>
              </Grid>
            </Grid>
          </Grid>
        </Grid>
      </Box>
    );
  };

  const getStopDonationScreen = () => {
    return (
      <Grid container spacing={2}>
        <Grid item xs={12}>
          {getRecipientDetails()}
        </Grid>
        {recordType === RecordType.PROJECT ? (
          <Grid item xs={12}>
            {getProjectStats()}
          </Grid>
        ) : (
          <></>
        )}
        <Grid item xs={12}>
          {getDonationConfirmationElement()}
        </Grid>
        <Grid item xs={12}>
          <Grid container>
            <Grid item xs />
            <Grid item xs={6}>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <PrimaryButton disabled={!canWithdraw()} onClick={handleWithdrawSubmit} fullWidth>
                    {txnButtonText(pendingTransactions, PENDING_TXN_WITHDRAW, t`Withdraw`)}
                  </PrimaryButton>
                </Grid>
                <Grid item xs={12}>
                  <TertiaryButton onClick={() => setIsWithdrawing(false)} fullWidth>
                    <Trans>Cancel</Trans>
                  </TertiaryButton>
                </Grid>
              </Grid>
            </Grid>
            <Grid item xs />
          </Grid>
        </Grid>
      </Grid>
    );
  };

  const getEditConfirmationScreen = () => {
    return (
      <Grid container spacing={2}>
        <Grid item xs={12}>
          {getRecipientDetails()}
        </Grid>
        {recordType === RecordType.PROJECT ? (
          <Grid item xs={12}>
            {getProjectStats()}
          </Grid>
        ) : (
          <></>
        )}
        <Grid item xs={12}>
          {getDonationConfirmationElement()}
        </Grid>
        <Grid item xs={12}>
          <Grid container>
            <Grid item xs />
            <Grid item xs={6}>
              <PrimaryButton disabled={!canSubmit()} onClick={handleEditSubmit} fullWidth>
                {txnButtonText(pendingTransactions, PENDING_TXN_EDIT_GIVE, t`Confirm New sOHM`)}
              </PrimaryButton>
            </Grid>
            <Grid item xs />
          </Grid>
        </Grid>
      </Grid>
    );
  };

  return (
    <Modal
      open={isModalOpen}
      onClose={handleClose}
      headerText={getModalTitle() + " Donation"}
      closePosition="right"
      topLeft={getEscapeComponent()}
      minHeight="300px"
    >
      {shouldShowEditScreen()
        ? getEditDonationScreen()
        : shouldShowStopScreen()
        ? getStopDonationScreen()
        : shouldShowEditConfirmationScreen()
        ? getEditConfirmationScreen()
        : getInitialScreen()}
    </Modal>
  );
}
