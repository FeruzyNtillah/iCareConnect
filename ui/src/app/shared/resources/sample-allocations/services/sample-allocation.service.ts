import { Injectable } from "@angular/core";
import { Observable, of } from "rxjs";
import { OpenmrsHttpClientService } from "src/app/shared/modules/openmrs-http-client/services/openmrs-http-client.service";
import { SampleAllocation } from "../models/allocation.model";

import { groupBy } from "lodash";
import { catchError, map } from "rxjs/operators";

@Injectable({
  providedIn: "root",
})
export class SampleAllocationService {
  constructor(private httpClient: OpenmrsHttpClientService) {}

  getAllocationsBySampleUuid(uuid: string): Observable<any[]> {
    return this.httpClient.get(`lab/allocationsbysample?uuid=${uuid}`).pipe(
      map((response) => {
        const groupedAllocations = groupBy(
          response?.map((allocation) => new SampleAllocation(allocation)),
          "orderUuid"
        );
        return Object.keys(groupedAllocations).map((key) => {
          return {
            ...groupedAllocations[key][0]?.order,
            allocations: groupedAllocations[key],
          };
        });
      }),
      catchError((error) => of(error))
    );
  }

  saveResultsViaAllocations(results: any): Observable<any> {
    return this.httpClient.post(`lab/multipleresults`, results).pipe(
      map((response) => response),
      catchError((error) => of(error))
    );
  }
}
