/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as academics from "../academics.js";
import type * as adapters_academics from "../adapters/academics.js";
import type * as adapters_attendance from "../adapters/attendance.js";
import type * as adapters_behavior from "../adapters/behavior.js";
import type * as adapters_ids from "../adapters/ids.js";
import type * as adapters_marks from "../adapters/marks.js";
import type * as adapters_results from "../adapters/results.js";
import type * as adapters_timetable from "../adapters/timetable.js";
import type * as attendance from "../attendance.js";
import type * as calendar from "../calendar.js";
import type * as importDataset from "../importDataset.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_calendar from "../lib/calendar.js";
import type * as lib_formTeacher from "../lib/formTeacher.js";
import type * as marks from "../marks.js";
import type * as operations from "../operations.js";
import type * as overview from "../overview.js";
import type * as people from "../people.js";
import type * as portal from "../portal.js";
import type * as results from "../results.js";
import type * as seed from "../seed.js";
import type * as timetable from "../timetable.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  academics: typeof academics;
  "adapters/academics": typeof adapters_academics;
  "adapters/attendance": typeof adapters_attendance;
  "adapters/behavior": typeof adapters_behavior;
  "adapters/ids": typeof adapters_ids;
  "adapters/marks": typeof adapters_marks;
  "adapters/results": typeof adapters_results;
  "adapters/timetable": typeof adapters_timetable;
  attendance: typeof attendance;
  calendar: typeof calendar;
  importDataset: typeof importDataset;
  "lib/access": typeof lib_access;
  "lib/calendar": typeof lib_calendar;
  "lib/formTeacher": typeof lib_formTeacher;
  marks: typeof marks;
  operations: typeof operations;
  overview: typeof overview;
  people: typeof people;
  portal: typeof portal;
  results: typeof results;
  seed: typeof seed;
  timetable: typeof timetable;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
