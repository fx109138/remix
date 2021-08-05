import { performance } from "perf_hooks";

import type { Params } from "react-router";

import type { ServerBuild } from "./build";
import type { Request } from "./fetch";
import { Response } from "./fetch";
import { json } from "./responses";

/**
 * An object of arbitrary for route loaders and actions provided by the
 * server's `getLoadContext()` function.
 */
export type AppLoadContext = any;

/**
 * Data for a route that was returned from a `loader()`.
 */
export type AppData = any;

export async function loadRouteData(
  build: ServerBuild,
  routeId: string,
  request: Request,
  context: AppLoadContext,
  params: Params,
  time: typeof timer
): Promise<Response> {
  let routeModule = build.routes[routeId].module;

  if (!routeModule.loader) {
    return Promise.resolve(json(null));
  }

  let result = await routeModule.loader({ request, context, params, time });

  if (result === undefined) {
    throw new Error(
      `You defined a loader for route "${routeId}" but didn't return ` +
        `anything from your \`loader\` function. Please return a value or \`null\`.`
    );
  }

  return isResponse(result) ? result : json(result);
}

export async function callRouteAction(
  build: ServerBuild,
  routeId: string,
  request: Request,
  context: AppLoadContext,
  params: Params,
  time: typeof timer
): Promise<Response> {
  let routeModule = build.routes[routeId].module;

  if (!routeModule.action) {
    throw new Error(
      `You made a ${request.method} request to ${request.url} but did not provide ` +
        `an \`action\` for route "${routeId}", so there is no way to handle the ` +
        `request.`
    );
  }

  let result = await routeModule.action({
    request,
    context,
    params,
    time
  });

  if (result === undefined) {
    throw new Error(
      `You defined an action for route "${routeId}" but didn't return ` +
        `anything from your \`action\` function. Please return a value or \`null\`.`
    );
  }

  return isResponse(result) ? result : json(result);
}

function isResponse(value: any): value is Response {
  return (
    value != null &&
    typeof value.status === "number" &&
    typeof value.statusText === "string" &&
    typeof value.headers === "object" &&
    typeof value.body !== "undefined"
  );
}

export function extractData(response: Response): Promise<AppData> {
  let contentType = response.headers.get("Content-Type");

  if (contentType && /\bapplication\/json\b/.test(contentType)) {
    return response.json();
  }

  // What other data types do we need to handle here? What other kinds of
  // responses are people going to be returning from their loaders?
  // - application/x-www-form-urlencoded ?
  // - multipart/form-data ?
  // - binary (audio/video) ?

  return response.text();
}

export type Timings = Record<string, Array<{ name: string; time: number }>>;

export async function timer<Result>({
  name,
  type,
  fn,
  timings
}: {
  name: string;
  type: "action" | "loader";
  fn: () => Promise<Result>;
  timings: Timings;
}): Promise<Result> {
  const start = performance.now();
  const result = await fn();
  let timingType = timings[type];
  if (!timingType) timingType = timings[type] = [];
  timingType.push({ name, time: performance.now() - start });
  return result;
}

export function getServerTimeHeader(timings: Timings) {
  return Object.entries(timings)
    .map(([type, timingInfos]) => {
      return timingInfos.map(
        info => `${type};dur=${info.time.toFixed(2)};desc="${info.name}"`
      );
    })
    .flat()
    .join(", ");
}
