import { SearchRepresentation } from 'app/core/ui-services/search.service';
import { Assignment } from 'app/shared/models/assignments/assignment';
import { HasAgendaItem, ViewAgendaItem } from 'app/site/agenda/models/view-agenda-item';
import { HasListOfSpeakers, ViewListOfSpeakers } from 'app/site/agenda/models/view-list-of-speakers';
import { BaseProjectableViewModel } from 'app/site/base/base-projectable-view-model';
import { ProjectorElementBuildDeskriptor } from 'app/site/base/projectable';
import { ViewMeeting } from 'app/site/event-management/models/view-meeting';
import { HasAttachment, ViewMediafile } from 'app/site/mediafiles/models/view-mediafile';
import { HasViewPolls } from 'app/site/polls/models/has-view-polls';
import { ViewProjection } from 'app/site/projector/models/view-projection';
import { ViewProjector } from 'app/site/projector/models/view-projector';
import { HasTags, ViewTag } from 'app/site/tags/models/view-tag';
import { ViewUser } from 'app/site/users/models/view-user';
import { ViewAssignmentCandidate } from './view-assignment-candidate';
import { ViewAssignmentPoll } from './view-assignment-poll';

/**
 * A constant containing all possible assignment phases and their different
 * representations as numerical value, string as used in server, and the display
 * name.
 */
export const AssignmentPhases: { name: string; value: number; display_name: string }[] = [
    {
        name: 'PHASE_SEARCH',
        value: 0,
        display_name: 'Searching for candidates'
    },
    {
        name: 'PHASE_VOTING',
        value: 1,
        display_name: 'In the election process'
    },
    {
        name: 'PHASE_FINISHED',
        value: 2,
        display_name: 'Finished'
    }
];

export class ViewAssignment extends BaseProjectableViewModel<Assignment> {
    public static COLLECTION = Assignment.COLLECTION;
    protected _collection = Assignment.COLLECTION;

    public get assignment(): Assignment {
        return this._model;
    }

    public get candidatesAsUsers(): ViewUser[] {
        return this.candidates.map(candidate => candidate.user).filter(x => !!x);
    }

    public get phaseString(): string {
        const phase = AssignmentPhases.find(ap => ap.value === this.assignment.phase);
        return phase ? phase.display_name : '';
    }

    /**
     * @returns true if the assignment is in the 'finished' state
     * (not accepting votes or candidates anymore)
     */
    public get isFinished(): boolean {
        const finishedState = AssignmentPhases.find(ap => ap.name === 'PHASE_FINISHED');
        return this.phase === finishedState.value;
    }

    /**
     * @returns true if the assignment is in the 'searching' state
     */
    public get isSearchingForCandidates(): boolean {
        const searchState = AssignmentPhases.find(ap => ap.name === 'PHASE_SEARCH');
        return this.phase === searchState.value;
    }

    /**
     * @returns the amount of candidates in the assignment's candidate list
     */
    public get candidateAmount(): number {
        return this.candidates.length;
    }

    public formatForSearch(): SearchRepresentation {
        return { properties: [{ key: 'Title', value: this.getTitle() }], searchValue: [this.getTitle()] };
    }

    public getDetailStateURL(): string {
        return `/assignments/${this.id}`;
    }

    public getSlide(): ProjectorElementBuildDeskriptor {
        return {
            getBasicProjectorElement: options => ({
                name: Assignment.COLLECTION,
                id: this.id,
                getNumbers: () => ['name', 'id']
            }),
            slideOptions: [],
            projectionDefaultName: 'assignments',
            getDialogTitle: () => this.getTitle()
        };
    }
}
interface IAssignmentRelations extends HasViewPolls<ViewAssignmentPoll> {
    candidates: ViewAssignmentCandidate[];
    polls: ViewAssignmentPoll[];
    meeting: ViewMeeting;
}
export interface ViewAssignment
    extends Assignment,
        IAssignmentRelations,
        HasAttachment,
        HasTags,
        HasAgendaItem,
        HasListOfSpeakers {}
