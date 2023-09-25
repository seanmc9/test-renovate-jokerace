import { toastError, toastLoading, toastSuccess } from "@components/UI/Toast";
import DeployedContestContract from "@contracts/bytecodeAndAbi//Contest.sol/Contest.json";
import { MAX_ROWS } from "@helpers/csvConstants";
import { isSupabaseConfigured } from "@helpers/database";
import { useEthersSigner } from "@helpers/ethers";
import { isR2Configured } from "@helpers/r2";
import useV3ContestsIndex, { ContestValues } from "@hooks/useContestsIndexV3";
import { useContestParticipantsIndexV3 } from "@hooks/useContestsParticipantsIndexV3";
import { useContractFactoryStore } from "@hooks/useContractFactory";
import { useError } from "@hooks/useError";
import { waitForTransaction } from "@wagmi/core";
import { differenceInSeconds, getUnixTime } from "date-fns";
import { ContractFactory } from "ethers";
import { formatUnits } from "ethers/lib/utils";
import { loadFileFromBucket, saveFileToBucket } from "lib/buckets";
import { Recipient } from "lib/merkletree/generateMerkleTree";
import { canUploadLargeAllowlist } from "lib/vip";
import { useAccount, useNetwork } from "wagmi";
import { SubmissionMerkle, useDeployContestStore, VotingMerkle } from "./store";

export const MAX_SUBMISSIONS_LIMIT = 1000;
export const DEFAULT_SUBMISSIONS = 100;
const EMPTY_ROOT = "0x0000000000000000000000000000000000000000000000000000000000000000";

export function useDeployContest() {
  const { indexContestV3 } = useV3ContestsIndex();
  const { indexContestParticipantsV3 } = useContestParticipantsIndexV3();
  const stateContestDeployment = useContractFactoryStore(state => state);
  const {
    type,
    title,
    summary,
    prompt,
    submissionOpen,
    votingOpen,
    votingClose,
    votingMerkle,
    submissionMerkle,
    allowedSubmissionsPerUser,
    maxSubmissions,
    downvote,
    setDeployContestData,
    setIsLoading,
    setIsSuccess,
  } = useDeployContestStore(state => state);
  const { error, handleError } = useError();
  const { chain } = useNetwork();
  const { address } = useAccount();
  const signer = useEthersSigner();

  async function deployContest() {
    const isSpoofingDetected = await checkForSpoofing(signer?._address ?? "");

    if (isSpoofingDetected) {
      stateContestDeployment.setIsLoading(false);
      toastError("Spoofing detected! None shall pass.");
      setIsLoading(false);
      return;
    }

    stateContestDeployment.setIsLoading(true);
    stateContestDeployment.setIsSuccess(false);
    stateContestDeployment.setError("");
    setIsLoading(true);

    toastLoading("contest is deploying...");
    try {
      const factoryCreateContest = new ContractFactory(
        DeployedContestContract.abi,
        DeployedContestContract.bytecode,
        signer,
      );
      const contestInfo = type + "|" + summary + "|" + prompt;

      // Handle allowedSubmissionsPerUser and maxSubmissions in case they are not set, they are zero, or we pass "infinity" to the contract
      const finalAllowedSubmissionsPerUser =
        !isNaN(allowedSubmissionsPerUser) && allowedSubmissionsPerUser > 0
          ? allowedSubmissionsPerUser
          : MAX_SUBMISSIONS_LIMIT;
      const finalMaxSubmissions = !isNaN(maxSubmissions) && maxSubmissions > 0 ? maxSubmissions : MAX_SUBMISSIONS_LIMIT;

      const contestParameters = [
        getUnixTime(submissionOpen),
        differenceInSeconds(votingOpen, submissionOpen),
        differenceInSeconds(votingClose, votingOpen),
        finalAllowedSubmissionsPerUser,
        finalMaxSubmissions,
        downvote ? 1 : 0,
      ];

      const contractContest = await factoryCreateContest.deploy(
        title,
        contestInfo,
        submissionMerkle ? submissionMerkle.merkleRoot : EMPTY_ROOT,
        votingMerkle?.merkleRoot,
        contestParameters,
      );

      const transactionPromise = contractContest.deployTransaction.wait();

      // Wait for transaction to be executed
      await transactionPromise;

      const receiptDeployContest = await waitForTransaction({
        chainId: chain?.id,
        hash: contractContest.deployTransaction.hash as `0x${string}`,
      });

      setDeployContestData(
        chain?.name ?? "",
        chain?.id ?? 0,
        receiptDeployContest.transactionHash,
        contractContest.address,
        maxSubmissions,
      );

      const contestData = {
        title: title,
        type: type,
        summary: summary,
        prompt: prompt,
        datetimeOpeningSubmissions: submissionOpen,
        datetimeOpeningVoting: votingOpen,
        datetimeClosingVoting: votingClose,
        contractAddress: contractContest.address,
        votingMerkleRoot: votingMerkle?.merkleRoot ?? EMPTY_ROOT,
        submissionMerkleRoot: submissionMerkle?.merkleRoot ?? EMPTY_ROOT,
        authorAddress: address,
        networkName: chain?.name.toLowerCase().replace(" ", "") ?? "",
      };

      await saveFilesToBucket(votingMerkle, submissionMerkle);
      await indexContest(contestData, votingMerkle, submissionMerkle);

      toastSuccess("contest has been deployed!");
      setIsSuccess(true);
      setIsLoading(false);
      stateContestDeployment.setIsLoading(false);
      stateContestDeployment.setIsSuccess(true);
    } catch (e) {
      handleError(e, "Something went wrong and the contest couldn't be deployed.");
      stateContestDeployment.setIsLoading(false);
      stateContestDeployment.setError(error);
      setIsLoading(false);
    }
  }

  async function saveFilesToBucket(votingMerkle: VotingMerkle | null, submissionMerkle: SubmissionMerkle | null) {
    if (!isR2Configured) {
      throw new Error("R2 is not configured");
    }

    const tasks: Promise<void>[] = [];

    if (votingMerkle && !(await checkExistingFileInBucket(votingMerkle.merkleRoot))) {
      tasks.push(
        saveFileToBucket({
          fileId: votingMerkle.merkleRoot,
          content: formatRecipients(votingMerkle.voters),
        }),
      );
    }

    if (submissionMerkle && !(await checkExistingFileInBucket(submissionMerkle.merkleRoot))) {
      tasks.push(
        saveFileToBucket({
          fileId: submissionMerkle.merkleRoot,
          content: formatRecipients(submissionMerkle.submitters),
        }),
      );
    }

    try {
      await Promise.all(tasks);
    } catch (e) {
      handleError(e, "Something went wrong while saving files to bucket.");
      stateContestDeployment.setIsLoading(false);
      stateContestDeployment.setError(error);
      setIsLoading(false);
      throw e;
    }
  }

  async function checkExistingFileInBucket(fileId: string): Promise<boolean> {
    try {
      const existingData = await loadFileFromBucket({ fileId });
      return !!(existingData && existingData.length > 0);
    } catch (e) {
      return false;
    }
  }

  async function indexContest(
    contestData: ContestValues,
    votingMerkle: VotingMerkle | null,
    submissionMerkle: SubmissionMerkle | null,
  ) {
    try {
      if (!isSupabaseConfigured) {
        throw new Error("Supabase is not configured");
      }

      const tasks = [];

      tasks.push(indexContestV3(contestData));

      if (votingMerkle) {
        const submitters = submissionMerkle ? submissionMerkle.submitters : [];
        const voterSet = new Set(votingMerkle.voters.map(voter => voter.address));
        const submitterSet = new Set(submitters.map(submitter => submitter.address));

        // Combine voters and submitters, removing duplicates
        const allParticipants = Array.from(
          new Set([
            ...votingMerkle.voters.map(voter => voter.address),
            ...submitters.map(submitter => submitter.address),
          ]),
        );

        const everyoneCanSubmit = submitters.length === 0;
        tasks.push(
          indexContestParticipantsV3(
            contestData.contractAddress,
            allParticipants,
            voterSet,
            submitterSet,
            votingMerkle.voters,
            contestData.networkName,
            everyoneCanSubmit,
          ),
        );
      }

      await Promise.all(tasks);
    } catch (e) {
      stateContestDeployment.setIsLoading(false);
      stateContestDeployment.setError(error);
      setIsLoading(false);
      toastError(`contest deployment failed to index in db`, error);
    }
  }

  async function checkForSpoofing(address: string) {
    const exceedsVotingMaxRows = votingMerkle && votingMerkle.voters.length > MAX_ROWS;
    const exceedsSubmissionMaxRows = submissionMerkle && submissionMerkle.submitters.length > MAX_ROWS;

    let isVotingAllowListed = false;
    let isSubmissionAllowListed = false;

    if (exceedsVotingMaxRows) {
      isVotingAllowListed = await canUploadLargeAllowlist(address, votingMerkle.voters.length);
      if (!isVotingAllowListed) {
        return true;
      }
    }

    if (exceedsSubmissionMaxRows) {
      isSubmissionAllowListed = await canUploadLargeAllowlist(address, submissionMerkle.submitters.length);
      if (!isSubmissionAllowListed) {
        return true;
      }
    }

    return false;
  }

  // Helper function to format recipients (either voters or submitters)
  function formatRecipients(recipients: Recipient[]): Recipient[] {
    return recipients.map(recipient => ({
      ...recipient,
      numVotes: formatUnits(recipient.numVotes, 18),
    }));
  }

  return {
    deployContest,
  };
}
