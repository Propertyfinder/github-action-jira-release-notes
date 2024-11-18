"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const request = __importStar(require("request-promise"));
const _ = __importStar(require("lodash"));
(async () => {
    const domain = core.getInput("domain");
    const projects = core.getInput("projects");
    const version = core.getInput("version");
    const token = core.getInput("auth-token");
    const baseUrl = `https://${domain}.atlassian.net/rest/api/3/search/jql`;
    try {
        const releaseData = await getReleaseData(baseUrl, projects, version, token);
        console.log(`releaseData = ${releaseData}`);
        core.setOutput("releaseData", releaseData);
    }
    catch (error) {
        core.setFailed(error.message);
    }
})();
async function getReleaseData(baseUrl, projects, version, token) {
    var options = {
        method: 'POST',
        uri: baseUrl,
        headers: {
            Authorization: `Basic ${token}`
        },
        body: {
            fields: 'id,key,summary,components,summary,assignee,project',
            jql: `project IN (\"${projects}\" AND component = \"${version}\ ORDER BY created DESC`,
            maxResults: 100
        },
        json: true
    };
    return await request(options)
        .then(function (body) {
        console.log(body);
    })
        .catch(function (err) {
        console.log(err);
    });
}
async function getMarkdownReleaseNotes(baseUrl, project, version, token, releaseNotesUrl) {
    const url = baseUrl + "rest/api/3/search";
    const response = await request.get(url, {
        headers: {
            Authorization: `Basic ${token}`
        },
        qs: {
            "jql": `project=\"${project}\" AND fixVersion =\"${version}\"`,
            maxResults: 1000,
            fields: "project,issuetype,summary",
        },
        json: true,
    });
    const title = getTitle(response, version, releaseNotesUrl);
    const note = getNote(response, baseUrl);
    return title + note;
}
function getTitle(response, version, releaseNotesUrl) {
    return `## [Jira](${releaseNotesUrl})`;
}
function getNote(response, baseUrl) {
    const groupedIssues = getGroupedIssues(response.issues, baseUrl);
    if (groupedIssues.length == 0) {
        return "";
    }
    return groupedIssues.reduce((result, groupedIssue) => {
        result += "\n\n";
        result += `### ${groupedIssue.type}`;
        groupedIssue.issues.forEach(issue => {
            result += `\n\n[${issue.key}](${issue.url}) ${issue.summary}`;
        });
        return result;
    }, "");
}
function getGroupedIssues(rawValue, baseUrl) {
    const issues = rawValue.map((value) => {
        const key = value.key;
        const url = baseUrl + "browse/" + key;
        const fields = value.fields;
        const summary = fields.summary.replace(/"/g, "\`").replace(/'/g, "\`");
        const type = fields.issuetype.name;
        return new Issue(key, summary, type, url);
    }).sort((a, b) => {
        return a.type > b.type ? 1 : -1;
    });
    const groupedResult = _.groupBy(issues, function (issue) {
        return issue.type;
    });
    return _.map(groupedResult, (items, key) => {
        return new GroupedIssue(key, items);
    });
}
async function getReleaseNotesUrl(baseUrl, domain, project, version, token) {
    var _a;
    const url = `${baseUrl}rest/api/3/project/${project}/version`;
    const response = await request.get(url, {
        headers: {
            Authorization: `Basic ${token}`
        },
        qs: {
            query: version,
        },
        json: true,
    });
    const versionId = (_a = response.values[0]) === null || _a === void 0 ? void 0 : _a.id;
    if (versionId == undefined) {
        return "";
    }
    return `https://${domain}.atlassian.net/projects/${project}/versions/${versionId}`;
}
class Issue {
    constructor(key, summary, type, url) {
        this.key = key;
        this.summary = summary;
        this.type = type;
        this.url = url;
    }
}
class GroupedIssue {
    constructor(type, issues) {
        this.type = type;
        this.issues = issues;
    }
}
