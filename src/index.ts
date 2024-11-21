import * as core from "@actions/core";

import request from "request-promise";
import * as _ from 'lodash'

(async () => {
    const domain = core.getInput("domain")
    const projects = core.getInput("projects")
    const version = core.getInput("version")
    const token = core.getInput("auth-token")
    const order = core.getInput("order") || "DESC"

    const baseUrl = `https://${domain}.atlassian.net/rest/api/3/search/jql`

    try {
        const releaseData = await getIssues(baseUrl, projects, version, order, token);
        const releaseUrl = getJiraVersionTitle(domain, projects, version);
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
                  fields: ["id", "key", "summary", "components", "assignee", "project", "labels"],
                  jql: `project IN (${projects}) AND labels IN (${version}) ORDER BY created ${order}`,
                  maxResults: 100
                },
            json: true
        };
    console.log("Options:", JSON.stringify(options, null, 2));
    const response: IssuesData = await request(options);
    console.log("Response:", JSON.stringify(response, null, 2));
    return response;
}

function getJiraVersionTitle(domain: string, projects: string, version: string): string {
    const firstProject = projects.split(",")[0].trim()
    const url = `https://${domain}.atlassian.net/jira/software/c/projects/${firstProject}/issues`
    const query = `project IN (${projects}) AND labels IN (${version})`
    const encodedQuery = encodeURIComponent(query);

    return `[Jira - ${version}](${url}?jql=${encodedQuery})`
}

function convertToGitHubReleaseGroupedByProject(data: IssuesData, version: string, jiraVersionTitle: string): string {
    // Group issues by project name
    const issuesByProject: Record<string, Issue[]> = data.issues.reduce((group, issue) => {
        const projectName = issue.fields.project.name;
        if (!group[projectName]) {
            group[projectName] = [];
        }
        group[projectName].push(issue);
        return group;
    }, {} as Record<string, Issue[]>);

    const releaseBody = Object.entries(issuesByProject)
        .map(([projectName, issues]) => {
            const projectSection = `## ${sanitizeMarkdown(projectName)}\n`;
            const issuesList = issues
                .map(issue => {
                    const assignee = issue.fields.assignee
                        ? sanitizeMarkdown(issue.fields.assignee.displayName)
                        : "Unassigned";
                    const components = sanitizeMarkdown(issue.fields.components.map(c => c.name).join(", "));
                    return `[${sanitizeMarkdown(issue.key)}](https://pfinder.atlassian.net/browse/${sanitizeMarkdown(issue.key)}) ${sanitizeMarkdown(issue.fields.summary)} - ${assignee}`;
                })
                .join("\n\n");
            return projectSection + issuesList;
        })
        .join("\n\n");

    return `# ${jiraVersionTitle}\n\n${releaseBody}`;
}

function sanitizeMarkdown(input: string): string {
    return input.replace(/'/g, "&#39;").replace(/([\[\]\(\)_*`~])/g, "\\$1");
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
        labels: string[];
    };
}

interface IssuesData {
    issues: Issue[];
}
