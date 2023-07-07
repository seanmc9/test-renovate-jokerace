import { supabase } from "@config/supabase";
import { chains } from "@config/wagmi";
import getContestContractVersion from "@helpers/getContestContractVersion";
import { useContestStore } from "@hooks/useContest/store";
import { useProposalStore } from "@hooks/useProposal/store";
import { getAccount, readContract } from "@wagmi/core";
import { useRouter } from "next/router";
import { toast } from "react-toastify";
import { useAccount, useNetwork } from "wagmi";
import { useUserStore } from "./store";

export function useUser() {
  const { address: userAddress } = useAccount();
  const {
    setCurrentUserQualifiedToSubmit,
    setCurrentUserAvailableVotesAmount,
    setCurrentUserTotalVotesAmount,
    setCurrentUserProposalCount,
    currentUserTotalVotesAmount,
    contestMaxNumberSubmissionsPerUser,
  } = useUserStore(state => state);
  const { setIsListProposalsSuccess, setIsListProposalsLoading } = useProposalStore(state => state);
  const {
    submissionMerkleTree,
    setIsSuccess: setIsContestSuccess,
    setIsLoading: setIsContestLoading,
    setError: setContestError,
  } = useContestStore(state => state);
  const { chain } = useNetwork();
  const { asPath } = useRouter();
  const [chainName, address] = asPath.split("/").slice(2, 4);
  const lowerCaseChainName = chainName.replace(/\s+/g, "").toLowerCase();

  /**
   * Display an error toast in the UI for any contract related error
   */
  function onContractError(err: any) {
    let toastMessage = err?.message ?? err;
    if (err.code === "CALL_EXCEPTION") toastMessage = `This contract doesn't exist on ${chain?.name ?? "this chain"}.`;
    toast.error(toastMessage);
  }

  // Generate config for the contract
  async function getContractConfig() {
    const { abi } = await getContestContractVersion(address, chainName);

    if (abi === null) {
      toast.error(`This contract doesn't exist on ${chain?.name ?? "this chain"}.`);
      setContestError({ message: `This contract doesn't exist on ${chain?.name ?? "this chain"}.` });
      setIsContestSuccess(false);
      setIsListProposalsSuccess(false);
      setIsListProposalsLoading(false);
      setIsContestLoading(false);
      return;
    }

    const contractConfig = {
      addressOrName: address,
      contractInterface: abi,
      chainId: chains.find(c => c.name.replace(/\s+/g, "").toLowerCase() === lowerCaseChainName)?.id,
    };

    return contractConfig;
  }

  const checkIfCurrentUserQualifyToSubmit = async () => {
    const contractConfig = await getContractConfig();

    if (!userAddress || !contractConfig) return;

    if (submissionMerkleTree.getHexRoot() === "0x") {
      setCurrentUserQualifiedToSubmit(true);
    } else {
      try {
        // Perform a lookup in the 'contest_participants_v3' table.
        const { data } = await supabase
          .from("contest_participants_v3")
          .select("can_submit")
          .eq("user_address", userAddress)
          .eq("contest_address", address)
          .eq("network_name", lowerCaseChainName);

        if (data && data.length > 0 && data[0].can_submit) {
          setCurrentUserQualifiedToSubmit(true);
        } else {
          setCurrentUserQualifiedToSubmit(false);
        }
      } catch (error) {
        console.error("Error performing lookup in 'contest_participants_v3':", error);
        setCurrentUserQualifiedToSubmit(false);
      }
    }
  };

  /**
   * Check if the current user qualify to vote for this contest
   */
  async function checkIfCurrentUserQualifyToVote() {
    if (!userAddress) return;

    try {
      // Perform a lookup in the 'contest_participants_v3' table.
      const { data } = await supabase
        .from("contest_participants_v3")
        .select("num_votes")
        .eq("user_address", userAddress)
        .eq("contest_address", address)
        .eq("network_name", lowerCaseChainName);

      if (data && data.length > 0 && data[0].num_votes > 0) {
        const contractConfig = await getContractConfig();
        if (!contractConfig) return;

        const currentUserTotalVotesCast = await readContract({
          ...contractConfig,
          functionName: "contestAddressTotalVotesCast",
          args: userAddress,
        });

        const userVotes = data[0].num_votes;
        //@ts-ignore
        const castVotes = currentUserTotalVotesCast / 1e18;

        if (castVotes > 0) {
          setCurrentUserTotalVotesAmount(userVotes);
          setCurrentUserAvailableVotesAmount(userVotes - castVotes);
        } else {
          setCurrentUserTotalVotesAmount(userVotes);
          setCurrentUserAvailableVotesAmount(userVotes);
        }
      } else {
        setCurrentUserTotalVotesAmount(0);
        setCurrentUserAvailableVotesAmount(0);
      }
    } catch (error) {
      console.error("Error performing lookup in 'contest_participants_v3':", error);
      setCurrentUserTotalVotesAmount(0);
      setCurrentUserAvailableVotesAmount(0);
    }
  }

  /**
   * Update the amount of votes casted in this contest by the current user
   */
  async function updateCurrentUserVotes() {
    const contractConfig = await getContractConfig();

    if (!contractConfig) return;
    const accountData = getAccount();

    try {
      const currentUserTotalVotesCast = await readContract({
        ...contractConfig,
        functionName: "contestAddressTotalVotesCast",
        args: accountData?.address,
      });

      //@ts-ignore
      setCurrentUserAvailableVotesAmount(currentUserTotalVotesAmount - currentUserTotalVotesCast / 1e18);
    } catch (e) {
      console.error(e);
    }
  }

  return {
    checkIfCurrentUserQualifyToVote,
    checkIfCurrentUserQualifyToSubmit,
    updateCurrentUserVotes,
  };
}

export default useUser;