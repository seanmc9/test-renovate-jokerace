import getContestContractVersion from "@helpers/getContestContractVersion";
import isUrlToImage from "@helpers/isUrlToImage";
import { MappedProposalIds } from "@hooks/useProposal/store";
import { getProposalIdsRaw } from "@hooks/useProposal/utils";
import { BigNumber, utils } from "ethers";
import { readContracts } from "wagmi";
import { compareVersions } from "compare-versions";

interface RankDictionary {
  [key: string]: number;
}

export const COMMENTS_VERSION = "4.13";

const extractVotes = (forVotesValue: string, againstVotesValue: string) => {
  const netVotesBigNumber = BigNumber.from(forVotesValue).sub(againstVotesValue);
  const netVotes = Number(utils.formatEther(netVotesBigNumber));

  return netVotes;
};

const assignRankAndCheckTies = (mappedProposals: MappedProposalIds[], targetId: string) => {
  const sortedProposals = [...mappedProposals].sort((a, b) => b.votes - a.votes);

  let currentRank = 0;
  let lastVotes: number | null = null;
  const ranks: RankDictionary = {};

  sortedProposals.forEach(proposal => {
    if (proposal.votes !== lastVotes) {
      currentRank++;
      lastVotes = proposal.votes;
    }
    ranks[proposal.id] = proposal.votes > 0 ? currentRank : 0;
  });

  const rank = ranks[targetId];
  const isTied = Object.values(ranks).filter(targetRank => targetRank === rank).length > 1;

  return { rank, isTied };
};

const fetchProposalInfo = async (address: string, chainId: number, submission: string) => {
  const { abi, version } = await getContestContractVersion(address, chainId);

  if (!abi) return null;

  let contracts = [
    {
      address,
      abi,
      chainId,
      functionName: "getProposal",
      args: [submission],
    },
    {
      address,
      abi,
      chainId,
      functionName: "proposalVotes",
      args: [submission],
    },
    {
      address,
      abi,
      chainId,
      functionName: "proposalIsDeleted",
      args: [submission],
    },
  ];

  //@ts-ignore
  const results = (await readContracts({ contracts })) as any;
  const data = results[0].result;
  const forVotesBigInt = results[1].result[0] as bigint;
  const againstVotesBigInt = results[1].result[1] as bigint;
  const votes = extractVotes(forVotesBigInt.toString(), againstVotesBigInt.toString());
  const isDeleted = results[2].result;
  const content = isDeleted ? "This proposal has been deleted by the creator" : data.description;

  let rankInfo = { rank: 0, isTied: false };

  if (votes !== 0) {
    const proposalsIdsRawData = await getProposalIdsRaw(
      {
        address: address as `0x${string}`,
        abi: abi,
        chainId: chainId,
      },
      false,
    );

    const mappedProposals = proposalsIdsRawData[0].map((idData: any, index: number) => ({
      votes: extractVotes(proposalsIdsRawData[1][index].forVotes, proposalsIdsRawData[1][index].againstVotes),
      id: idData.toString(),
    })) as MappedProposalIds[];

    rankInfo = assignRankAndCheckTies(mappedProposals, submission);
  }

  return {
    proposal: {
      id: submission,
      authorEthereumAddress: data.author,
      content: content,
      isContentImage: isUrlToImage(data.description),
      exists: data.exists,
      votes,
      ...rankInfo,
    },
    version: parseFloat(version),
  };
};

const fetchNumberOfComments = async (address: string, chainId: number, submission: string) => {
  const { abi, version } = await getContestContractVersion(address, chainId);

  if (!abi) return null;

  if (compareVersions(version, COMMENTS_VERSION) == -1) return 0;

  const contracts = [
    {
      address,
      abi,
      chainId,
      functionName: "getProposalComments",
      args: [submission],
    },
    {
      address,
      abi,
      chainId,
      functionName: "getAllDeletedCommentIds",
      args: [],
    },
  ];

  //@ts-ignore
  const results = (await readContracts({ contracts })) as any;
  const allCommentsIdsBigInt = results[0]?.result as bigint[];
  const deletedCommentIdsBigInt = results[1]?.result as bigint[];
  const deletedCommentIdsSet = new Set(deletedCommentIdsBigInt);

  return allCommentsIdsBigInt.filter(id => !deletedCommentIdsSet.has(id)).length;
};

export const fetchProposalData = async (address: string, chainId: number, submission: string) => {
  try {
    const [proposalInfo, numberOfComments] = await Promise.all([
      fetchProposalInfo(address, chainId, submission),
      fetchNumberOfComments(address, chainId, submission),
    ]);

    if (!proposalInfo) return null;

    return {
      ...proposalInfo,
      numberOfComments,
    };
  } catch (error) {
    console.error(error);
    return null;
  }
};
