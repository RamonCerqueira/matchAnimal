import { Controller, Get, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { LocationService } from "./location.service";

@Controller("location")
export class LocationController {
  constructor(private readonly location: LocationService) {}

  @Get("search")
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  search(@Query("q") query = "") { return this.location.search(query); }

  @Get("reverse")
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  reverse(@Query("lat") latitude: string, @Query("lon") longitude: string) { return this.location.reverse(Number(latitude), Number(longitude)); }
}
