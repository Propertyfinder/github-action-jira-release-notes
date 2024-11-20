import * as core from "@actions/core";

import request from "request-promise";
import * as _ from 'lodash'


const jsonString = `
{
    "issues": [
        {
            "id": "149645",
            "key": "NA-3797",
            "fields": {
                "summary": "Reduce Main Thread Load in the PLP if exist",
                "project": {
                    "name": "Native Apps"
                },
                "components": [
                    {
                        "name": "Android"
                    }
                ],
                "assignee": null
            }
        },
        {
            "id": "149128",
            "key": "NA-3775",
            "fields": {
                "summary": "Update new rega fields alignments",
                "project": {
                    "name": "Native Apps"
                },
                "components": [
                    {
                        "name": "Android"
                    },
                    {
                        "name": "Squad: Search Experience"
                    }
                ],
                "assignee": {
                    "displayName": "Murat Varol"
                }
            }
        }
    ]
}`;

(async () => {
    const domain = core.getInput("domain") || "pfinder";
    const projects = core.getInput("projects") || "NA, CX, GROW, NP";
    const version = core.getInput("version") || "Android";
    const token = core.getInput("auth-token")
    const order = core.getInput("order") || "DESC"

    const baseUrl = `https://pfinder.atlassian.net/rest/api/3/search/jql`

    try {
        const releaseData = await getIssues(baseUrl, projects, version, order, token);
        const releaseUrl = getJiraQueryUrl(domain, projects, version);
        const releaseNotes = convertToGitHubReleaseGroupedByProject(releaseData, version, releaseUrl);
        console.log("releaseNotes:", releaseNotes);
        core.setOutput("release_notes", `${releaseNotes}`);
    } catch (error: any) {
        core.setFailed(error.message);
    }

})();

async function getIssues(
    baseUrl: string,
    projects: string,
    version: string,
    order: string,
    token: string,
): Promise<IssuesData> {
    var options = {
            method: 'POST',
            uri: baseUrl,
            headers: {
                Authorization: `Basic ${token}`
                },
            body: {
                  fields: ["id", "key", "summary", "components", "assignee", "project"],
                  jql: `project IN (${projects}) AND component = ${version} ORDER BY created ${order}`,
                  maxResults: 100
                },
            json: true
        };
    console.log("Options:", JSON.stringify(options, null, 2));
    const response: IssuesData = await request(options);
    console.log("Response:", JSON.stringify(response, null, 2));
    return response;
}

function getJiraQueryUrl(domain: string, projects: string, version: string): string {
    const firstProject = projects.split(",")[0].trim()
    const url = `https://${domain}.atlassian.net/jira/software/c/projects/${firstProject}/issues`
    const query = `project IN (${projects}) AND component = ${version}`
    const encodedQuery = encodeURIComponent(query);

    // working
    // [Jira - PF Android](https://pfinder.atlassian.net/jira/software/c/projects/NA/issues?jql=project%20IN%20(NA%2C%20CX%2C%20GROW%2C%20NP)%20AND%20component%20%3D%20Android)
    return `## [Jira - PF ${version}](${url}?jql=${encodedQuery})`
}

function convertToGitHubReleaseGroupedByProject(data: IssuesData, version: string, releaseUrl: string): string {
    const releaseTitle = `[Pf Android - ${version}](${releaseUrl})`;

    // Group issues by project name
    const issuesByProject: Record<string, Issue[]> = data.issues.reduce((group, issue) => {
        const projectName = issue.fields.project.name;
        if (!group[projectName]) {
            group[projectName] = [];
        }
        group[projectName].push(issue);
        return group;
    }, {} as Record<string, Issue[]>);

    // Generate release notes grouped by project
    const releaseBody = Object.entries(issuesByProject)
        .map(([projectName, issues]) => {
            const projectSection = `## ${projectName}\n`;
            const issuesList = issues
                .map(issue => {
                    const assignee = issue.fields.assignee
                        ? issue.fields.assignee.displayName
                        : "Unassigned";
                    const components = issue.fields.components.map(c => c.name).join(", ");
                    return `[${issue.key}](https://pfinder.atlassian.net/browse/${issue.key}) ${issue.fields.summary} - ${assignee}`;

                })
                .join("\n\n");
            return projectSection + issuesList;
        })
        .join("\n\n");

    return `# ${releaseTitle}\n\n${releaseBody}`;
}

interface Issue {
    id: string;
    key: string;
    fields: {
        summary: string;
        assignee: {
            displayName: string;
            emailAddress: string;
        };
        project: {
            name: string;
        };
        components: {
            name: string;
        }[];
    };
}

interface IssuesData {
    issues: Issue[];
}

class GroupedIssue {
    type: string
    issues: Issue[]

    constructor(type: string, issues: Issue[]) {
        this.type = type;
        this.issues = issues;
    }
}
