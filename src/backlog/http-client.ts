import axios, { type AxiosInstance } from "axios";
import {
  issueListUrl,
  issueUrl,
  commentsUrl,
  projectStatusesUrl,
  prioritiesUrl,
  projectCategoriesUrl,
  projectVersionsUrl,
} from "./endpoints.js";
import {
  mapIssue,
  mapIssueSummary,
  mapComment,
  mapStatus,
  mapPriority,
  mapCategory,
  mapMilestone,
} from "./mappers.js";
import { backlogHttpError, backlogResponseError } from "../errors.js";
import type {
  BacklogRawIssue,
  BacklogRawComment,
  BacklogRawStatus,
  BacklogRawPriority,
  BacklogRawCategory,
  BacklogRawMilestone,
} from "../types/backlog-api.js";
import type {
  BacklogIssue,
  BacklogIssueSummary,
  BacklogComment,
  BacklogStatus,
  BacklogPriority,
  BacklogCategory,
  BacklogMilestone,
} from "../types.js";

// ---------------------------------------------------------------------------
// Input param shapes
// ---------------------------------------------------------------------------

export interface GetIssueListParams {
  projectId?: number[];
  statusId?: number[];
  priorityId?: number[];
  assigneeId?: number[];
  categoryId?: number[];
  milestoneId?: number[];
  keyword?: string;
  parentChild?: 0 | 1 | 2 | 3 | 4;
  offset?: number;
  count?: number;
  sort?: string;
  order?: "asc" | "desc";
}

export interface GetCommentsParams {
  minId?: number;
  maxId?: number;
  count?: number;
  order?: "asc" | "desc";
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class BacklogHttpClient {
  private readonly http: AxiosInstance;
  private readonly baseUrl: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.http = axios.create({
      baseURL: this.baseUrl,
      // API Key is appended automatically to every request via params
      params: { apiKey },
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      validateStatus: () => true, // we inspect status ourselves
    });
  }

  // ---------------------------------------------------------------------------
  // backlog_get_issue_list
  // ---------------------------------------------------------------------------

  async getIssueList(params: GetIssueListParams): Promise<BacklogIssueSummary[]> {
    const url = issueListUrl(this.baseUrl);

    // Backlog uses repeated query params for arrays, e.g. projectId[]=1&projectId[]=2
    // axios serializes arrays correctly with default serializer
    const queryParams: Record<string, unknown> = {};
    if (params.projectId?.length)   queryParams["projectId[]"]   = params.projectId;
    if (params.statusId?.length)    queryParams["statusId[]"]    = params.statusId;
    if (params.priorityId?.length)  queryParams["priorityId[]"]  = params.priorityId;
    if (params.assigneeId?.length)  queryParams["assigneeId[]"]  = params.assigneeId;
    if (params.categoryId?.length)  queryParams["categoryId[]"]  = params.categoryId;
    if (params.milestoneId?.length) queryParams["milestoneId[]"] = params.milestoneId;
    if (params.keyword)             queryParams["keyword"]        = params.keyword;
    if (params.parentChild != null) queryParams["parentChild"]   = params.parentChild;
    if (params.offset != null)      queryParams["offset"]        = params.offset;
    if (params.count != null)       queryParams["count"]         = params.count;
    if (params.sort)                queryParams["sort"]           = params.sort;
    if (params.order)               queryParams["order"]          = params.order;

    const res = await this.http.get(url, { params: queryParams });

    this.assertOk(res.status, url, res.data);

    if (!Array.isArray(res.data)) {
      throw backlogResponseError("Expected array response from GET /api/v2/issues", res.data);
    }

    return (res.data as BacklogRawIssue[]).map((raw) =>
      mapIssueSummary(raw, this.baseUrl)
    );
  }

  // ---------------------------------------------------------------------------
  // backlog_get_issue
  // ---------------------------------------------------------------------------

  async getIssue(issueIdOrKey: string): Promise<BacklogIssue> {
    const url = issueUrl(this.baseUrl, issueIdOrKey);
    const res = await this.http.get(url);

    this.assertOk(res.status, url, res.data);

    const raw = res.data as BacklogRawIssue;
    if (!raw || typeof raw !== "object" || !raw.issueKey) {
      throw backlogResponseError("Unexpected issue response shape", res.data);
    }

    return mapIssue(raw, this.baseUrl);
  }

  // ---------------------------------------------------------------------------
  // backlog_get_comments
  // ---------------------------------------------------------------------------

  async getComments(
    issueIdOrKey: string,
    params: GetCommentsParams = {}
  ): Promise<BacklogComment[]> {
    const url = commentsUrl(this.baseUrl, issueIdOrKey);

    const queryParams: Record<string, unknown> = {};
    if (params.minId != null) queryParams["minId"] = params.minId;
    if (params.maxId != null) queryParams["maxId"] = params.maxId;
    if (params.count != null) queryParams["count"] = params.count;
    if (params.order)         queryParams["order"] = params.order;

    const res = await this.http.get(url, { params: queryParams });

    this.assertOk(res.status, url, res.data);

    if (!Array.isArray(res.data)) {
      throw backlogResponseError(
        "Expected array response from GET /api/v2/issues/{key}/comments",
        res.data
      );
    }

    return (res.data as BacklogRawComment[]).map(mapComment);
  }

  // ---------------------------------------------------------------------------
  // backlog_get_statuses
  // ---------------------------------------------------------------------------

  async getStatuses(projectIdOrKey: string): Promise<BacklogStatus[]> {
    const url = projectStatusesUrl(this.baseUrl, projectIdOrKey);
    const res = await this.http.get(url);
    this.assertOk(res.status, url, res.data);
    if (!Array.isArray(res.data)) {
      throw backlogResponseError("Expected array response from GET /statuses", res.data);
    }
    return (res.data as BacklogRawStatus[]).map(mapStatus);
  }

  // ---------------------------------------------------------------------------
  // backlog_get_priorities
  // ---------------------------------------------------------------------------

  async getPriorities(): Promise<BacklogPriority[]> {
    const url = prioritiesUrl(this.baseUrl);
    const res = await this.http.get(url);
    this.assertOk(res.status, url, res.data);
    if (!Array.isArray(res.data)) {
      throw backlogResponseError("Expected array response from GET /priorities", res.data);
    }
    return (res.data as BacklogRawPriority[]).map(mapPriority);
  }

  // ---------------------------------------------------------------------------
  // backlog_get_categories
  // ---------------------------------------------------------------------------

  async getCategories(projectIdOrKey: string): Promise<BacklogCategory[]> {
    const url = projectCategoriesUrl(this.baseUrl, projectIdOrKey);
    const res = await this.http.get(url);
    this.assertOk(res.status, url, res.data);
    if (!Array.isArray(res.data)) {
      throw backlogResponseError("Expected array response from GET /categories", res.data);
    }
    return (res.data as BacklogRawCategory[]).map(mapCategory);
  }

  // ---------------------------------------------------------------------------
  // backlog_get_milestones
  // ---------------------------------------------------------------------------

  async getMilestones(
    projectIdOrKey: string,
    archived?: boolean
  ): Promise<BacklogMilestone[]> {
    const url = projectVersionsUrl(this.baseUrl, projectIdOrKey);
    const queryParams: Record<string, unknown> = {};
    if (archived != null) queryParams["archived"] = archived;
    const res = await this.http.get(url, { params: queryParams });
    this.assertOk(res.status, url, res.data);
    if (!Array.isArray(res.data)) {
      throw backlogResponseError("Expected array response from GET /versions", res.data);
    }
    return (res.data as BacklogRawMilestone[]).map(mapMilestone);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private assertOk(status: number, url: string, body: unknown): void {
    if (status < 200 || status >= 300) {
      // Extract Backlog error message if available
      let detail: string | undefined;
      if (body && typeof body === "object") {
        const errors = (body as { errors?: Array<{ message?: string }> }).errors;
        if (Array.isArray(errors) && errors.length > 0) {
          detail = errors.map((e) => e.message).filter(Boolean).join("; ");
        }
      }
      throw backlogHttpError(
        status,
        url,
        detail ?? (typeof body === "string" ? body : undefined)
      );
    }
  }
}
