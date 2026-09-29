// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract UniversityGrantManagement {

    address public university;

    enum GrantStatus {
        Open,
        Active,
        Completed
    }

    enum ApplicationStatus {
        Pending,
        Approved
    }

    enum MilestoneStatus {
        Pending,
        Submitted,
        Paid
    }

    struct Grant {
        uint256 id;
        string title;
        uint256 totalFunds;
        uint256 remainingFunds;
        GrantStatus status;
        address researcher;
    }

    struct Application {
        address applicant;
        string proposal;
        ApplicationStatus status;
    }

    struct Milestone {
        string description;
        uint256 amount;
        MilestoneStatus status;
    }

    uint256 public grantCount;

    mapping(uint256 => Grant) public grants;
    mapping(uint256 => Application[]) public applications;
    mapping(uint256 => Milestone[]) public milestones;

    constructor() {
        university = msg.sender;
    }

    modifier onlyUniversity() {
        require(msg.sender == university, "Only university");
        _;
    }

    function createGrant(string calldata _title)
        external
        payable
        onlyUniversity
    {
        require(msg.value > 0, "No funds");

        grantCount++;

        grants[grantCount] = Grant({
            id: grantCount,
            title: _title,
            totalFunds: msg.value,
            remainingFunds: msg.value,
            status: GrantStatus.Open,
            researcher: address(0)
        });
    }

    function applyForGrant(uint256 _grantId, string calldata _proposal) external {
    require(grants[_grantId].status == GrantStatus.Open, "Grant not open");

    applications[_grantId].push();
    applications[_grantId][applications[_grantId].length - 1].applicant = msg.sender;
    applications[_grantId][applications[_grantId].length - 1].proposal = _proposal;
    applications[_grantId][applications[_grantId].length - 1].status = ApplicationStatus.Pending;
}

    function approveApplication(
        uint256 _grantId,
        uint256 _applicationId
    )
        external
        onlyUniversity
    {
        require(
            grants[_grantId].status == GrantStatus.Open,
            "Grant not open"
        );

        Application storage app =
            applications[_grantId][_applicationId];

        require(
            app.status == ApplicationStatus.Pending,
            "Already processed"
        );

        app.status = ApplicationStatus.Approved;

        grants[_grantId].researcher = app.applicant;
        grants[_grantId].status = GrantStatus.Active;
    }

    function addMilestone(
        uint256 _grantId,
        string calldata _description,
        uint256 _amount
    )
        external
        onlyUniversity
    {
        Grant storage grant = grants[_grantId];

        require(
            grant.status == GrantStatus.Active,
            "Grant not active"
        );

        require(
            _amount > 0 &&
            _amount <= grant.remainingFunds,
            "Invalid amount"
        );

        milestones[_grantId].push(
            Milestone({
                description: _description,
                amount: _amount,
                status: MilestoneStatus.Pending
            })
        );
    }

    function submitMilestone(
        uint256 _grantId,
        uint256 _milestoneId
    )
        external
    {
        Grant storage grant = grants[_grantId];

        require(
            msg.sender == grant.researcher,
            "Only researcher"
        );

        Milestone storage milestone =
            milestones[_grantId][_milestoneId];

        require(
            milestone.status == MilestoneStatus.Pending,
            "Invalid milestone"
        );

        milestone.status = MilestoneStatus.Submitted;
    }

    function approveMilestone(
        uint256 _grantId,
        uint256 _milestoneId
    )
        external
        onlyUniversity
    {
        Grant storage grant = grants[_grantId];

        Milestone storage milestone =
            milestones[_grantId][_milestoneId];

        require(
            milestone.status == MilestoneStatus.Submitted,
            "Not submitted"
        );

        require(
            milestone.amount <= grant.remainingFunds,
            "Insufficient funds"
        );

        milestone.status = MilestoneStatus.Paid;

        grant.remainingFunds -= milestone.amount;

        payable(grant.researcher).transfer(
            milestone.amount
        );

        if (grant.remainingFunds == 0) {
            grant.status = GrantStatus.Completed;
        }
    }

    function getGrant(uint256 _grantId)
        external
        view
        returns (
            string memory title,
            uint256 totalFunds,
            uint256 remainingFunds,
            GrantStatus status,
            address researcher
        )
    {
        Grant memory grant = grants[_grantId];

        return (
            grant.title,
            grant.totalFunds,
            grant.remainingFunds,
            grant.status,
            grant.researcher
        );
    }

    function getApplication(
        uint256 _grantId,
        uint256 _applicationId
    )
        external
        view
        returns (
            address applicant,
            string memory proposal,
            ApplicationStatus status
        )
    {
        Application memory app =
            applications[_grantId][_applicationId];

        return (
            app.applicant,
            app.proposal,
            app.status
        );
    }

    function getMilestone(
        uint256 _grantId,
        uint256 _milestoneId
    )
        external
        view
        returns (
            string memory description,
            uint256 amount,
            MilestoneStatus status
        )
    {
        Milestone memory milestone =
            milestones[_grantId][_milestoneId];

        return (
            milestone.description,
            milestone.amount,
            milestone.status
        );
    }

    function getApplicationCount(uint256 _grantId)
        external
        view
        returns (uint256)
    {
        return applications[_grantId].length;
    }

    function getMilestoneCount(uint256 _grantId)
        external
        view
        returns (uint256)
    {
        return milestones[_grantId].length;
    }

    function getUniversity()
        external
        view
        returns (address)
    {
        return university;
    }

    function getContractBalance()
        external
        view
        returns (uint256)
    {
        return address(this).balance;
    }
}