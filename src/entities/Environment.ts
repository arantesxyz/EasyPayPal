import Axios, { AxiosInstance, AxiosResponse } from "axios";

import { BaseURL, Endpoints, Time } from "../constants";

class Environment {
  _instance: AxiosInstance;
  options: EnvironmentOptions;

  _tokenCache: TokenCache;

  constructor(options: EnvironmentOptions) {
    this.options = Object.assign(options, {
      live: true,
      timeout: 1000,
      maxTries: 5
    });

    this._instance = Axios.create({
      baseURL: this.options.live ? BaseURL.LIVE_URL : BaseURL.SANDBOX_URL,
      headers: {
        "Content-Type": "application/json"
      },
      timeout: this.options.timeout });

    this._tokenCache = {
      token: "",
      expiresAt: 0
    };
  }

  /**
   * Generate a new token
   */
  async generateToken(): Promise<TokenCache> {
    const basicAuth = Buffer
      .from(`${this.options.clientId}:${this.options.secret}`)
      .toString("base64");
    
    const { status, statusText, data } = await this._instance.post(
      Endpoints.OAUTH,
      "grant_type=client_credentials",
      {
        headers: {
          "Authorization": `Basic ${basicAuth}`
        }
      }
    );

    if (status != 200) {
      throw { status, message: statusText };
    }

    return this._tokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in * 1000)
    };
  }

  /**
   * Get cached token or generate a new one
   */
  async getToken(): Promise<string> {
    if ((this._tokenCache.expiresAt + Time.ONE_MINUTE_IN_MS) <= Date.now())
      await this.generateToken();

    return this._tokenCache.token;
  }

  /**
   * Make a request to paypal's API.
   * @param method HTTP method to use
   * @param endpoint Endpoint to hit
   * @param data Body data
   */
  async request(method: string, endpoint: string, data?: any, tries = 0):
  Promise<AxiosResponse> {
    if (tries > (this.options.maxTries || 0))
      throw new Error("Max number of tries. Invalid token!");

    const response =  await this._instance.request({
      url: endpoint,
      data,
      headers: {
        "Authorization": `Bearer ${await this.getToken()}`
      }
    });

    if (response.status == 401) {
      await this.generateToken();
      return this.request(method, endpoint, data, ++tries);
    }

    return response;
  }
}

interface EnvironmentOptions {
  clientId: string;
  secret: string;
  live?: boolean;
  timeout?: number;
  maxTries?: number;
}

interface TokenCache {
  token: string;
  expiresAt: number; // TimeStamp
}

export { Environment };