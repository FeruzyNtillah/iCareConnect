import {
  Component,
  EventEmitter,
  Inject,
  Input,
  OnInit,
  Output,
  ViewChild,
} from "@angular/core";
import { Observable } from "rxjs";
import { map, switchMap, tap } from "rxjs/operators";
import { VisitsService } from "../../resources/visits/services/visits.service";
import { Store } from "@ngrx/store";
import { AppState } from "src/app/store/reducers";
import {
  getAllForms,
  getCustomOpenMRSFormById,
  getCustomOpenMRSFormsByIds,
} from "src/app/store/selectors/form.selectors";
import { SystemSettingsService } from "src/app/core/services/system-settings.service";
import { MAT_DIALOG_DATA } from "@angular/material/dialog";
import { getParentLocation } from "src/app/store/selectors";
import {
  getCurrentUserDetails,
  getProviderDetails,
} from "src/app/store/selectors/current-user.selectors";
import {
  PersonGetRef,
  PrivilegeGetRef,
  RoleGetRef,
} from "../../resources/openmrs";
import { loadCustomOpenMRSForm } from "src/app/store/actions";
import { FormValue } from "../../modules/form/models/form-value.model";
import { ICARE_CONFIG } from "../../resources/config";
import { PatientHistoryDataComponent } from "../patient-history-data/patient-history-data.component";
import { FormControl, FormGroup, Validators } from "@angular/forms";
import { ObservationService } from "../../resources/observation/services";

@Component({
  selector: "app-patient-history",
  templateUrl: "./patient-history.component.html",
  styleUrls: ["./patient-history.component.scss"],
})
export class PatientHistoryComponent implements OnInit {
  @Output() formDataSaved: EventEmitter<any> = new EventEmitter<any>();
  // @Input() savedFormData: any;
  form: FormGroup;
  @Input() patient: any;
  @Input() location: any;
  saving: boolean = false;
  formData: any;
  visits$: Observable<any>;
  customForms$: Observable<any>;
  generalPrescriptionOrderType$: any;
  prescriptionArrangementFields$: Observable<any>;
  specificDrugConceptUuid$: Observable<unknown>;
  errors: any[] = [];
  allForms$: Observable<any>;
  loadingData: boolean = false;
  facilityDetails$: Observable<any>;
  currentUser$: Observable<any>;
  provider$: Observable<any>;

  doctorsIPDRoundForm$: Observable<any>;

  constructor(
    private visitsService: VisitsService,
    private store: Store<AppState>,
    private systemSettingsService: SystemSettingsService,
    private observationService: ObservationService
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.loadData();
  }

  private initForm(): void {
    // Initialize the form with necessary fields and validators
    this.form = new FormGroup({
      fieldName: new FormControl('', Validators.required), // example field
    });
  }

  private loadData(): void {
    this.loadingData = true;
    this.customForms$ = this.store.select(getAllForms);
    this.facilityDetails$ = this.store.select(getParentLocation);
    this.currentUser$ = this.store.select(getCurrentUserDetails);
    this.provider$ = this.store.select(getProviderDetails);

    // Fetch system settings for prescription types
    this.generalPrescriptionOrderType$ =
      this.systemSettingsService.getSystemSettingsByKey(
        "iCare.clinic.genericPrescription.orderType"
      );

    this.prescriptionArrangementFields$ = this.systemSettingsService
      .getSystemSettingsByKey("iCare.clinic.prescription.arrangement")
      .pipe(
        map((response) => {
          if (response === "none") {
            this.errors = [
              ...this.errors,
              {
                error: {
                  message:
                    "Arrangement setting isn't defined, Set 'iCare.clinic.prescription.arrangement' or Contact IT (Close to continue)",
                },
                type: "warning",
              },
            ];
          }
          if (response?.error) {
            this.errors = [...this.errors, response?.error];
          }
          return {
            ...response,
            keys: Object.keys(response).length,
          };
        })
      );

    this.specificDrugConceptUuid$ = this.systemSettingsService
      .getSystemSettingsByKey(
        "iCare.clinic.genericPrescription.specificDrugConceptUuid"
      )
      .pipe(
        tap((response) => {
          if (response === "none") {
            this.errors = [
              ...this.errors,
              {
                error: {
                  message:
                    "Generic Use Specific drug Concept config is missing, Set 'iCare.clinic.genericPrescription.specificDrugConceptUuid' or Contact IT (Close to continue)",
                },
                type: "warning",
              },
            ];
          }
        })
      );

    this.visits$ = this.visitsService
      .getAllPatientVisits(this.patient?.uuid, true)
      .pipe(
        map((response) => {
          this.loadingData = false;
          console.log('Fetched visits:', response); // Debugging
          if (!response?.error) {
            return response?.map((visit) => {
              let obs = [];
              visit?.visit?.encounters?.forEach((encounter) => {
                (encounter?.obs || []).forEach((observation) => {
                  obs = [
                    ...obs,
                    {
                      ...observation,
                      encounterType: {
                        uuid: encounter?.encounterType?.uuid,
                        display: encounter?.encounterType?.display,
                      },
                      provider: encounter?.encounterProviders[0]?.provider,
                    },
                  ];
                });
              });
              return {
                visit: visit?.visit,
                notes: visit?.visit?.notes || "No notes available", // Add visit notes
                obs: obs,
                serviceRecords: visit?.visit?.serviceRecords ,
                orders: [
                  ...visit?.visit?.encounters?.map((encounter) => {
                    return (encounter?.orders || []).map((order) => {
                      return {
                        ...order,
                        encounterType: {
                          uuid: encounter?.encounterType?.uuid,
                          display: encounter?.encounterType?.display,
                        },
                      };
                    });
                  }),
                ].filter((order) => order.length),
              };
            });
          }
        })
      );
  }

  onDoctorsIPDRoundCommentsFormUpdate(formValue: FormValue): void {
    console.log(formValue.getValues());
    this.formData = formValue.getValues();
  }

  onSave(event: Event, form: any, provider: any, visit: any): void {
    event.stopPropagation();
    const obs = Object.keys(this.formData).map((key: string) => {
      return {
        concept: key,
        value: this.formData[key]?.value,
      };
    });

    const encounterObject = {
      patient: this.patient?.uuid,
      encounterType: form?.encounterType?.uuid,
      location: this.location?.uuid,
      encounterProviders: [
        {
          provider: provider?.uuid,
          encounterRole: ICARE_CONFIG?.encounterRole?.uuid,
        },
      ],
      visit: visit?.uuid,
      obs: obs,
      form: {
        uuid: form?.uuid,
      },
    };

    this.observationService
      .saveEncounterWithObsDetails(encounterObject)
      .subscribe((res) => {
        if (res) {
          this.loadData(); // Reload data after saving
        }
      });
  }
}
